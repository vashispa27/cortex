import AppKit
import ApplicationServices
import CoreGraphics
import CryptoKit
import Foundation

// A single, read-only foreground observation. The caller must check consent and
// exclusions before storing anything; this process never asks for AX permission.
// Browser private state is not inferred. Both public and private foreground
// windows are read when Accessibility exposes their text.

private let maximumNodes = 5_000
private let maximumDepth = 40
private let maximumTextBytes = 128 * 1024
private let maximumOutputBytes = 512 * 1024
private let maximumEmittedNodes = 1_024
private let maximumAncestorEntries = 12
private let maximumNodeOutputBytes = maximumOutputBytes - 32 * 1024
private let anonymousWrapperRoles: Set<String> = ["AXGroup", "AXUnknown", "unknown"]
private var deadline = DispatchTime.now().uptimeNanoseconds + 750_000_000

private func bounded(_ value: String, bytes: Int) -> String {
    var count = 0
    var result = ""
    for scalar in value.unicodeScalars {
        let length = String(scalar).utf8.count
        if count + length > bytes { break }
        result.unicodeScalars.append(scalar)
        count += length
    }
    return result
}

private func emit(_ object: [String: Any]) -> Never {
    let data = (try? JSONSerialization.data(withJSONObject: object, options: [.fragmentsAllowed]))
        ?? Data(#"{"status":"skipped","reason":"serialization_failed"}"#.utf8)
    let safe = data.count <= maximumOutputBytes
        ? data
        : Data(#"{"status":"skipped","reason":"output_limit"}"#.utf8)
    FileHandle.standardOutput.write(safe)
    FileHandle.standardOutput.write(Data([0x0A]))
    exit(0)
}

private func skip(_ reason: String) -> Never {
    emit(["status": "skipped", "reason": reason])
}

private func timeLeft() -> Bool { DispatchTime.now().uptimeNanoseconds < deadline }

private func axValue(_ element: AXUIElement, _ attribute: String) -> CFTypeRef? {
    guard timeLeft() else { return nil }
    var value: CFTypeRef?
    AXUIElementSetMessagingTimeout(element, 0.05)
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
    return value
}

private func axString(_ element: AXUIElement, _ attribute: String, bytes: Int = 8_192) -> String? {
    guard let value = axValue(element, attribute) as? String else { return nil }
    return bounded(value, bytes: bytes)
}

private func axURL(_ element: AXUIElement) -> String? {
    guard let value = axValue(element, "AXURL") else { return nil }
    if let url = value as? URL { return bounded(url.absoluteString, bytes: 8_192) }
    if let text = value as? String { return bounded(text, bytes: 8_192) }
    return nil
}

private func axBool(_ element: AXUIElement, _ attribute: String) -> Bool? {
    guard let value = axValue(element, attribute) else { return nil }
    if let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() {
        return number.boolValue
    }
    return nil
}

private func axElement(_ parent: AXUIElement, _ attribute: String) -> AXUIElement? {
    guard let value = axValue(parent, attribute), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
    return (value as! AXUIElement)
}

private func visibleMultilineValue(_ element: AXUIElement) -> String? {
    guard let rangeValue = axValue(element, "AXVisibleCharacterRange"),
          CFGetTypeID(rangeValue) == AXValueGetTypeID() else { return nil }
    var range = CFRange(location: 0, length: 0)
    guard AXValueGetValue(rangeValue as! AXValue, .cfRange, &range),
          range.location >= 0, range.length > 0 else { return nil }
    // Request at most 8 KiB of visible characters; never ask for the full document.
    range.length = min(range.length, 8_192)
    guard let parameter = AXValueCreate(.cfRange, &range), timeLeft() else { return nil }
    var value: CFTypeRef?
    AXUIElementSetMessagingTimeout(element, 0.05)
    guard AXUIElementCopyParameterizedAttributeValue(element, "AXStringForRange" as CFString,
                                                    parameter, &value) == .success,
          let text = value as? String else { return nil }
    return bounded(text, bytes: 8_192)
}

private func rect(_ element: AXUIElement) -> CGRect? {
    guard let position = axValue(element, kAXPositionAttribute as String),
          let size = axValue(element, kAXSizeAttribute as String),
          CFGetTypeID(position) == AXValueGetTypeID(),
          CFGetTypeID(size) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero
    var dimensions = CGSize.zero
    guard AXValueGetValue(position as! AXValue, .cgPoint, &point),
          AXValueGetValue(size as! AXValue, .cgSize, &dimensions),
          dimensions.width > 0, dimensions.height > 0 else { return nil }
    return CGRect(origin: point, size: dimensions)
}

private func screenUnion() -> CGRect? {
    var count: UInt32 = 0
    guard CGGetActiveDisplayList(0, nil, &count) == .success, count > 0 else { return nil }
    var displays = [CGDirectDisplayID](repeating: 0, count: Int(count))
    guard CGGetActiveDisplayList(count, &displays, &count) == .success else { return nil }
    let bounds = displays.prefix(Int(count)).map(CGDisplayBounds)
    guard let first = bounds.first else { return nil }
    return bounds.dropFirst().reduce(first) { $0.union($1) }
}

private func sessionActive() -> Bool {
    guard let session = CGSessionCopyCurrentDictionary() as? [String: Any] else { return false }
    guard (session["kCGSSessionOnConsoleKey"] as? Bool) == true else { return false }
    guard (session["kCGSessionLoginDoneKey"] as? Bool) == true else { return false }
    guard (session["kCGSSessionLoginwindowSafeLogin"] as? Bool) == false else { return false }
    if (session["CGSSessionScreenIsLocked"] as? Bool) == true { return false }
    return true
}

private func isKnownBrowser(_ identifier: String, name: String?) -> Bool {
    let id = identifier.lowercased()
    let exact: Set<String> = [
        "com.apple.safari", "com.google.chrome", "com.google.chrome.beta",
        "com.google.chrome.canary", "org.mozilla.firefox", "org.mozilla.firefoxdeveloperedition",
        "com.microsoft.edgemac", "com.microsoft.edgemac.beta", "com.brave.browser",
        "company.thebrowser.browser", "company.thebrowser.dia", "com.operasoftware.opera",
        "com.vivaldi.vivaldi", "com.duckduckgo.macos.browser", "com.kagi.kagimacos",
        "org.torproject.torbrowser", "app.zen-browser.zen", "org.mozilla.librewolf"
    ]
    let browserNames = ["safari", "chrome", "chromium", "firefox", "edge", "brave", "arc",
                        "opera", "vivaldi", "duckduckgo", "orion", "zen browser", "floorp",
                        "librewolf", "waterfox", "tor browser"]
    let lowerName = name?.lowercased() ?? ""
    return exact.contains(id) || id.hasPrefix("com.apple.safari") || id.hasPrefix("com.google.chrome.")
        || id.hasPrefix("org.mozilla.firefox.") || id.hasPrefix("com.microsoft.edgemac.")
        || id.hasPrefix("com.brave.browser.")
        || browserNames.contains { lowerName == $0 || lowerName.hasPrefix("\($0) ") }
}

private func isSensitiveApp(_ identifier: String) -> Bool {
    let id = identifier.lowercased()
    return id.contains("1password") || id.contains("lastpass") || id.contains("bitwarden")
        || id.contains("keepass") || id.contains("dashlane") || id.contains("keychain")
        || id == "com.apple.loginwindow" || id.hasPrefix("com.apple.screensaver")
}

private func isSensitiveControl(role: String, subrole: String, name: String) -> Bool {
    let identity = "\(role) \(subrole) \(name)".lowercased()
    let tokens = ["password", "passcode", "one-time code", "otp", "credit card", "cvv", "security code", "private key", "secret key", "access token", "api key"]
    return tokens.contains { identity.contains($0) } || subrole == "AXSecureTextField"
}

private struct WorkItem {
    let element: AXUIElement
    let depth: Int
    let context: String
    let ancestors: [[String: String]]
}

private func extendingAncestors(_ ancestors: [[String: String]], role: String, name: String) -> [[String: String]] {
    let entry = ["role": bounded(role, bytes: 64), "name": bounded(name, bytes: 96)]
    var path = ancestors + [entry]
    while path.count > maximumAncestorEntries {
        // Remove anonymous wrappers first so a named Conversation or sidebar
        // remains available to the cleaner even in a deeply nested page.
        let middle = 1..<(path.count - 2)
        let removable = middle.first { index in
            path[index]["name", default: ""].isEmpty &&
                anonymousWrapperRoles.contains(path[index]["role", default: ""])
        } ?? middle.first { index in
            path[index]["name", default: ""].isEmpty &&
                path[index]["role"] != "AXWebArea"
        } ?? 1
        path.remove(at: removable)
    }
    return path
}

private func readChildren(_ element: AXUIElement, remaining: Int) -> [AXUIElement] {
    guard timeLeft(), remaining > 0 else { return [] }
    var count: CFIndex = 0
    AXUIElementSetMessagingTimeout(element, 0.05)
    guard AXUIElementGetAttributeValueCount(element, kAXChildrenAttribute as CFString, &count) == .success,
          count > 0 else { return [] }
    let limit = min(count, CFIndex(min(remaining, 64)))
    var value: CFArray?
    guard AXUIElementCopyAttributeValues(element, kAXChildrenAttribute as CFString, 0, limit, &value) == .success,
          let children = value as? [AXUIElement] else { return [] }
    return children
}

private func collectText(from window: AXUIElement, visibleBounds: CGRect) -> ([[String: Any]], String?, [String]) {
    var stack = [WorkItem(element: window, depth: 0, context: "", ancestors: [])]
    var visited = 0
    var textBytes = 0
    var nodeOutputBytes = 0
    var outputBudgetReached = false
    var nodes: [[String: Any]] = []
    var url: String?
    // Chrome shows the address without its scheme ("linkedin.com/feed/"), so this is only used when no web area
    // reports the real address.
    var addressBarURL: String?
    var protectedCount = 0
    var missingBounds = 0
    while let item = stack.popLast(), timeLeft(), visited < maximumNodes,
          nodes.count < maximumEmittedNodes, textBytes < maximumTextBytes {
        visited += 1
        if item.depth > maximumDepth { continue }
        let role = axString(item.element, kAXRoleAttribute as String, bytes: 128) ?? "unknown"
        let subrole = axString(item.element, kAXSubroleAttribute as String, bytes: 128) ?? ""
        // A secure element is dropped before AXValue is queried. Descendants are
        // also skipped because a provider can expose the same secret underneath.
        if axBool(item.element, "AXProtectedContent") == true ||
            axBool(item.element, "AXIsPasswordField") == true ||
            axBool(item.element, "AXSecure") == true ||
            role == "AXPasswordField" || subrole == "AXSecureTextField" {
            protectedCount += 1
            continue
        }
        let name = axString(item.element, kAXTitleAttribute as String, bytes: 1_024)
            ?? axString(item.element, kAXDescriptionAttribute as String, bytes: 1_024)
            ?? ""
        let placeholder = axString(item.element, "AXPlaceholderValue", bytes: 256) ?? ""
        if isSensitiveControl(role: role, subrole: subrole, name: "\(name) \(placeholder)") {
            protectedCount += 1
            continue
        }
        if axBool(item.element, "AXHidden") == true || axBool(item.element, "AXVisible") == false { continue }

        // A page link's AXURL is not the address of the current tab. Only use
        // the browser's address field or web area, never arbitrary page links.
        let isAddress = (name + " " + placeholder).lowercased().contains("address")
        if url == nil && (isAddress || role == "AXWebArea") {
            let candidate = axURL(item.element)
                ?? axString(item.element, kAXValueAttribute as String, bytes: 8_192)
            if let candidate, let parsed = URL(string: candidate),
               ["https", "http", "file"].contains(parsed.scheme?.lowercased() ?? "") {
                url = candidate
            } else if isAddress, addressBarURL == nil, let candidate, let schemeless = schemelessAddress(candidate) {
                addressBarURL = schemeless
            }
        }

        let frame = rect(item.element)
        if frame == nil { missingBounds += 1 }
        let visiblyIntersects = frame.map { !$0.isEmpty && $0.intersects(visibleBounds) } ?? true
        if visiblyIntersects {
            // Container values can include off-screen or protected descendants.
            // Only read value from visible text-bearing leaves.
            let textRoles: Set<String> = ["AXStaticText", "AXTextField", "AXTextArea", "AXTextView", "AXHeading"]
            let namedRoles: Set<String> = ["AXButton", "AXLink", "AXCheckBox", "AXRadioButton", "AXMenuItem", "AXTab"]
            var value: String?
            if role == "AXTextArea" || role == "AXTextView" {
                value = visibleMultilineValue(item.element)
                    ?? axString(item.element, kAXValueAttribute as String)
            } else if textRoles.contains(role) {
                value = axString(item.element, kAXValueAttribute as String)
            }
            let display = value ?? ((textRoles.contains(role) || namedRoles.contains(role)) ? name : "")
            if !display.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                let clipped = bounded(display, bytes: min(8_192, maximumTextBytes - textBytes))
                var node: [String: Any] = [
                    "role": role,
                    "name": bounded([item.context, name].filter { !$0.isEmpty }.joined(separator: " / "), bytes: 512),
                    "value": clipped,
                    "ancestor_path": item.ancestors,
                    "visible": true,
                    "protected": false,
                    "excluded": false,
                    "children": []
                ]
                if let frame {
                    let visibleFrame = frame.intersection(visibleBounds)
                    if !visibleFrame.isNull, [visibleFrame.minX, visibleFrame.minY,
                                              visibleFrame.width, visibleFrame.height].allSatisfy(\.isFinite) {
                        node["bounds"] = ["x": visibleFrame.minX, "y": visibleFrame.minY,
                                          "width": visibleFrame.width, "height": visibleFrame.height]
                    }
                }
                // Leave room for envelope metadata, URLs, and limitations. A long
                // ancestry must not make the entire observation exceed the limit.
                let nodeBytes = (try? JSONSerialization.data(withJSONObject: node))?.count ?? maximumNodeOutputBytes
                if nodeOutputBytes + nodeBytes + 1 > maximumNodeOutputBytes {
                    outputBudgetReached = true
                    break
                }
                nodeOutputBytes += nodeBytes + 1
                textBytes += clipped.utf8.count
                nodes.append(node)
            }
        }
        if item.depth < maximumDepth {
            let nextContext = !name.isEmpty && ["AXGroup", "AXRow", "AXCell", "AXWebArea", "AXList", "AXArticle"].contains(role)
                ? bounded(name, bytes: 256) : item.context
            let nextAncestors = extendingAncestors(item.ancestors, role: role, name: name)
            for child in readChildren(item.element, remaining: maximumNodes - visited).reversed() {
                stack.append(WorkItem(element: child, depth: item.depth + 1, context: nextContext,
                                      ancestors: nextAncestors))
            }
        }
    }
    var limitations: [String] = []
    if protectedCount > 0 { limitations.append("protected_controls_omitted:\(protectedCount)") }
    if missingBounds > 0 { limitations.append("some_element_bounds_unavailable:\(missingBounds)") }
    if !timeLeft() { limitations.append("accessibility_deadline") }
    if visited >= maximumNodes { limitations.append("node_limit") }
    if nodes.count >= maximumEmittedNodes { limitations.append("output_node_limit") }
    if outputBudgetReached { limitations.append("output_byte_limit") }
    if textBytes >= maximumTextBytes { limitations.append("text_limit") }
    return (nodes, url ?? addressBarURL, limitations)
}

/// A browser address field's text without a scheme, such as `linkedin.com/feed/`, as an https address.
/// Anything with a space, or that is not a host with an optional port and path, is not an address.
private func schemelessAddress(_ text: String) -> String? {
    let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !value.isEmpty, value.count <= 2_048, !value.contains("://"),
          value.range(of: #"^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:[0-9]{1,5})?([/?#]\S*)?$"#, options: .regularExpression) != nil
    else { return nil }
    return "https://" + value
}

private func idleMilliseconds() -> Int? {
    let seconds = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .null)
    guard seconds.isFinite, seconds >= 0, seconds < Double(Int.max) / 1_000 else { return nil }
    return Int(seconds * 1_000)
}

private func readFrontmost() -> Never {
    guard AXIsProcessTrusted() else { skip("accessibility_not_granted") }
    guard sessionActive() else { skip("session_inactive") }
    guard let app = NSWorkspace.shared.frontmostApplication,
          app.isActive, !app.isHidden, !app.isTerminated,
          app.processIdentifier != getpid(),
          let appID = app.bundleIdentifier, !appID.isEmpty else { skip("no_foreground_app") }
    let excludedApps = Set(CommandLine.arguments.dropFirst().compactMap { argument -> String? in
        guard argument.hasPrefix("--exclude-app=") else { return nil }
        return String(argument.dropFirst("--exclude-app=".count)).lowercased()
    })
    guard !excludedApps.contains(appID.lowercased()) else { skip("excluded_app") }
    if CommandLine.arguments.contains("--skip-browsers") && isKnownBrowser(appID, name: app.localizedName) {
        skip("ambiguous_browser_context")
    }
    guard !isSensitiveApp(appID) else { skip("sensitive_app") }
    guard let screenBounds = screenUnion() else { skip("no_display") }

    let application = AXUIElementCreateApplication(app.processIdentifier)
    // Chrome and Electron apps only expose page content to assistive software that asks for it. Without this a
    // browser shows its toolbar and nothing else, so no address and no text were captured.
    enableRichAccessibility(application, appID: appID)
    guard let window = axElement(application, kAXFocusedWindowAttribute as String)
        ?? axElement(application, kAXMainWindowAttribute as String) else {
        skip("no_focused_window")
    }
    if axBool(window, kAXMinimizedAttribute as String) == true { skip("window_not_visible") }
    guard let windowFrame = rect(window), windowFrame.intersects(screenBounds) else { skip("window_not_visible") }
    let title = axString(window, kAXTitleAttribute as String, bytes: 4_096) ?? ""
    let windowNumber = axValue(window, "AXWindowNumber") as? Int
    let sessionSeed = "\(app.processIdentifier):\(windowNumber.map(String.init) ?? title)"
    let windowID = SHA256.hash(data: Data(sessionSeed.utf8)).map { String(format: "%02x", $0) }.joined()
    let (roots, url, detectedLimitations) = collectText(from: window, visibleBounds: windowFrame.intersection(screenBounds))
    var limitations = detectedLimitations
    if isKnownBrowser(appID, name: app.localizedName) && url == nil {
        limitations.append("browser_url_unavailable")
    }
    guard !roots.isEmpty else { skip("no_visible_text") }
    let timestamp = Int64(Date().timeIntervalSince1970 * 1_000)
    let windowObject: [String: Any] = [
        "app_id": appID,
        "window_session_id": windowID,
        "title": title,
        "browser": ["kind": "not_browser"],
        "session": "active",
        "observed_ms": timestamp,
        "timezone": TimeZone.current.identifier,
        "source_event": "poll",
        "focus_role": axElement(application, kAXFocusedUIElementAttribute as String).flatMap { axString($0, kAXRoleAttribute as String) } ?? "",
        "focus_name": axElement(application, kAXFocusedUIElementAttribute as String).flatMap { axString($0, kAXTitleAttribute as String) ?? axString($0, kAXDescriptionAttribute as String) } ?? "",
        "focus_path": NSNull(),
        "roots": roots
    ]
    let browser = isKnownBrowser(appID, name: app.localizedName)
    let privateTitle = title.lowercased().contains("incognito") || title.lowercased().contains("private browsing")
    var envelope: [String: Any] = ["status": "ok", "window": windowObject,
                                   "source_type": browser ? (privateTitle ? "browser_private" : "browser") : "app",
                                   "limitations": limitations,
                                   "url": url ?? NSNull()]
    if let idle = idleMilliseconds() { envelope["idle_ms"] = idle }
    emit(envelope)
}

// MARK: - Focus reader and guarded field writes
//
// These modes run only after an explicit double-tap of the user's trigger key.
// `--focus` reads the focused field, caret, selection and the text above the field.
// `--read-target` re-reads the same field for the guard. `--replace-selection`
// writes one exact range. Nothing here presses Return, and secure fields, sensitive
// apps and excluded apps are refused before any value is read.

private let focusTextBeforeLimit = 2_000
private let focusTextAfterLimit = 500
private let focusSelectionLimit = 24_000
private let focusTailBytes = 4_096
private let maximumFieldUTF16 = 400_000
private let ownBundleIDs: Set<String> = ["app.cortex.desktop", "app.cortex.capture"]
private let textFieldRoles: Set<String> = ["AXTextArea", "AXTextField", "AXComboBox", "AXSearchField", "AXTextView"]
// Apps whose AX text writes are unreliable go straight to synthesized typing.
private let typingFirstApps: [String] = [
    "com.tinyspeck.slackmacgap", "com.microsoft.vscode", "notion.id", "com.hnc.discord",
    "com.google.chrome", "org.chromium", "com.brave.browser", "com.microsoft.edgemac",
    "company.thebrowser", "com.operasoftware", "com.vivaldi", "org.mozilla"
]
private let chromiumPrefixes: [String] = [
    "com.google.chrome", "org.chromium", "com.brave.browser", "com.microsoft.edgemac",
    "company.thebrowser", "com.operasoftware", "com.vivaldi"
]

private func nowMilliseconds() -> Int64 { Int64(Date().timeIntervalSince1970 * 1_000) }

private func sha256Hex(_ text: String) -> String {
    SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
}

private func readStandardInputJSON() -> [String: Any] {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard data.count <= 256 * 1024,
          let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
    return object
}

private func argumentValues(_ prefix: String) -> [String] {
    CommandLine.arguments.dropFirst().compactMap { argument in
        argument.hasPrefix(prefix) ? String(argument.dropFirst(prefix.count)).lowercased() : nil
    }
}

private func axCFRange(_ element: AXUIElement, _ attribute: String) -> CFRange? {
    guard let value = axValue(element, attribute), CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
    var range = CFRange(location: 0, length: 0)
    guard AXValueGetValue(value as! AXValue, .cfRange, &range), range.location >= 0, range.length >= 0 else { return nil }
    return range
}

private func setAXRange(_ element: AXUIElement, location: Int, length: Int) -> Bool {
    var range = CFRange(location: location, length: length)
    guard let value = AXValueCreate(.cfRange, &range) else { return false }
    AXUIElementSetMessagingTimeout(element, 0.2)
    return AXUIElementSetAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, value) == .success
}

private func isSettable(_ element: AXUIElement, _ attribute: String) -> Bool {
    var settable: DarwinBoolean = false
    AXUIElementSetMessagingTimeout(element, 0.05)
    return AXUIElementIsAttributeSettable(element, attribute as CFString, &settable) == .success && settable.boolValue
}

private func isSecureElement(_ element: AXUIElement, role: String, subrole: String) -> Bool {
    axBool(element, "AXProtectedContent") == true || axBool(element, "AXIsPasswordField") == true
        || axBool(element, "AXSecure") == true || role == "AXPasswordField" || subrole == "AXSecureTextField"
}

private func elementName(_ element: AXUIElement) -> String {
    axString(element, kAXTitleAttribute as String, bytes: 512)
        ?? axString(element, kAXDescriptionAttribute as String, bytes: 512) ?? ""
}

private func fingerprint(_ element: AXUIElement, role: String, subrole: String, windowID: String) -> String {
    let identifier = axString(element, "AXIdentifier", bytes: 256) ?? axString(element, "AXDOMIdentifier", bytes: 256) ?? ""
    let placeholder = axString(element, "AXPlaceholderValue", bytes: 256) ?? ""
    var origin = ""
    if let frame = rect(element) { origin = "\(Int(frame.minX / 2)),\(Int(frame.minY / 2))" }
    return sha256Hex([role, subrole, identifier, placeholder, elementName(element), origin, windowID].joined(separator: "|"))
}

private func hasEditableAncestor(_ element: AXUIElement) -> Bool {
    axElement(element, "AXEditableAncestor") != nil
}

private func parentChain(_ element: AXUIElement, limit: Int = 30) -> [AXUIElement] {
    var chain: [AXUIElement] = []
    var current = element
    for _ in 0..<limit {
        guard let parent = axElement(current, kAXParentAttribute as String) else { break }
        chain.append(parent)
        current = parent
    }
    return chain
}

private struct FieldRead {
    let pid: pid_t
    let appID: String
    let appName: String
    let launchedMs: Int64
    let application: AXUIElement
    let window: AXUIElement?
    let windowTitle: String
    let windowID: String
    let element: AXUIElement
    let role: String
    let subrole: String
    let editable: Bool
    let multiline: Bool
    let text: String?        // full AXValue when editable and within limits
    let selection: CFRange?
    let selectedText: String
    let url: String?
    let isBrowser: Bool
    let privateWindow: Bool
}

private enum FocusFailure: Error { case skipped(String) }

private func enableRichAccessibility(_ application: AXUIElement, appID: String) {
    let lower = appID.lowercased()
    if chromiumPrefixes.contains(where: { lower.hasPrefix($0) }) {
        AXUIElementSetAttributeValue(application, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
    }
    AXUIElementSetAttributeValue(application, "AXManualAccessibility" as CFString, kCFBooleanTrue)
}

private func readFocusedField(readText: Bool) throws -> FieldRead {
    guard AXIsProcessTrusted() else { throw FocusFailure.skipped("accessibility_not_granted") }
    guard sessionActive() else { throw FocusFailure.skipped("session_inactive") }
    guard let app = NSWorkspace.shared.frontmostApplication, !app.isTerminated,
          let appID = app.bundleIdentifier, !appID.isEmpty else { throw FocusFailure.skipped("no_foreground_app") }
    if app.processIdentifier == getpid() || ownBundleIDs.contains(appID.lowercased()) { throw FocusFailure.skipped("own_window") }
    if Set(argumentValues("--exclude-app=")).contains(appID.lowercased()) { throw FocusFailure.skipped("excluded_app") }
    if isSensitiveApp(appID) { throw FocusFailure.skipped("sensitive_app") }

    let application = AXUIElementCreateApplication(app.processIdentifier)
    enableRichAccessibility(application, appID: appID)
    let window = axElement(application, kAXFocusedWindowAttribute as String) ?? axElement(application, kAXMainWindowAttribute as String)
    let title = window.flatMap { axString($0, kAXTitleAttribute as String, bytes: 4_096) } ?? ""
    let windowNumber = window.flatMap { axValue($0, "AXWindowNumber") as? Int }
    let windowID = sha256Hex("\(app.processIdentifier):\(windowNumber.map(String.init) ?? title)")
    guard let element = axElement(application, kAXFocusedUIElementAttribute as String) else { throw FocusFailure.skipped("no_focused_element") }
    let role = axString(element, kAXRoleAttribute as String, bytes: 128) ?? ""
    let subrole = axString(element, kAXSubroleAttribute as String, bytes: 128) ?? ""
    if isSecureElement(element, role: role, subrole: subrole) { throw FocusFailure.skipped("secure_field") }
    let placeholder = axString(element, "AXPlaceholderValue", bytes: 256) ?? ""
    if isSensitiveControl(role: role, subrole: subrole, name: "\(elementName(element)) \(placeholder)") {
        throw FocusFailure.skipped("secure_field")
    }
    // A secure ancestor (for example a password sheet) also blocks the read.
    for ancestor in parentChain(element, limit: 8) {
        let ancestorRole = axString(ancestor, kAXRoleAttribute as String, bytes: 128) ?? ""
        let ancestorSubrole = axString(ancestor, kAXSubroleAttribute as String, bytes: 128) ?? ""
        if isSecureElement(ancestor, role: ancestorRole, subrole: ancestorSubrole) { throw FocusFailure.skipped("secure_field") }
    }
    let isBrowser = isKnownBrowser(appID, name: app.localizedName)
    var url: String?
    if isBrowser {
        for ancestor in [element] + parentChain(element) where (axString(ancestor, kAXRoleAttribute as String, bytes: 64) ?? "") == "AXWebArea" {
            if let candidate = axURL(ancestor), let parsed = URL(string: candidate),
               ["https", "http", "file"].contains(parsed.scheme?.lowercased() ?? "") { url = candidate }
            break
        }
    }
    let lowerTitle = title.lowercased()
    let privateWindow = isBrowser && (lowerTitle.contains("incognito") || lowerTitle.contains("private browsing"))

    let valueSettable = isSettable(element, kAXValueAttribute as String)
    let editable = (textFieldRoles.contains(role) && valueSettable)
        || axBool(element, "AXEditable") == true || (role != "AXWebArea" && hasEditableAncestor(element))
    var text: String?
    var selection: CFRange?
    var selectedText = ""
    if readText {
        selection = axCFRange(element, kAXSelectedTextRangeAttribute as String)
        selectedText = String((axString(element, kAXSelectedTextAttribute as String, bytes: focusSelectionLimit * 4) ?? "").prefix(focusSelectionLimit))
        if editable, let value = axValue(element, kAXValueAttribute as String) as? String, value.utf16.count <= maximumFieldUTF16 {
            text = value
        }
    }
    let multiline = role == "AXTextArea" || role == "AXTextView" || (text?.contains("\n") ?? false)
        || (role != "AXTextField" && role != "AXComboBox" && role != "AXSearchField" && editable)
    return FieldRead(pid: app.processIdentifier, appID: appID, appName: app.localizedName ?? "", launchedMs: Int64((app.launchDate?.timeIntervalSince1970 ?? 0) * 1_000),
                     application: application, window: window, windowTitle: title, windowID: windowID, element: element, role: role,
                     subrole: subrole, editable: editable, multiline: multiline, text: text, selection: selection,
                     selectedText: selectedText, url: url, isBrowser: isBrowser, privateWindow: privateWindow)
}

private func substringUTF16(_ text: String, location: Int, length: Int) -> String? {
    let ns = text as NSString
    guard location >= 0, length >= 0, location + length <= ns.length else { return nil }
    return ns.substring(with: NSRange(location: location, length: length))
}

private func targetRevision(_ field: FieldRead) -> [String: Any]? {
    guard field.editable, let text = field.text, let selection = field.selection,
          let selected = substringUTF16(text, location: selection.location, length: selection.length) else { return nil }
    let print = fingerprint(field.element, role: field.role, subrole: field.subrole, windowID: field.windowID)
    return [
        "app_id": field.appID,
        "process_id": Int(field.pid),
        "process_started_at_ms": field.launchedMs,
        "window_session_id": field.windowID,
        "element_handle": "ax:" + String(print.prefix(16)),
        "element_fingerprint": print,
        "field_text_hash": sha256Hex(text),
        "selection": ["start": selection.location, "end": selection.location + selection.length],
        "selected_text_hash": sha256Hex(selected),
        "captured_at_ms": nowMilliseconds()
    ]
}

// Text nodes above the field, in reading order, ending with the newest message.
private func conversationTail(window: AXUIElement, field: CGRect, budgetNanos: UInt64) -> String {
    let stop = DispatchTime.now().uptimeNanoseconds + budgetNanos
    var stack: [(AXUIElement, Int)] = [(window, 0)]
    var visited = 0
    var found: [(CGRect, String)] = []
    while let (element, depth) = stack.popLast(), DispatchTime.now().uptimeNanoseconds < stop, timeLeft(), visited < 1_500, found.count < 400 {
        visited += 1
        let role = axString(element, kAXRoleAttribute as String, bytes: 64) ?? ""
        let subrole = axString(element, kAXSubroleAttribute as String, bytes: 64) ?? ""
        if isSecureElement(element, role: role, subrole: subrole) { continue }
        if axBool(element, "AXHidden") == true || axBool(element, "AXVisible") == false { continue }
        if role == "AXStaticText" || role == "AXHeading" {
            if let frame = rect(element), frame.maxY <= field.minY + 2 {
                let midX = frame.midX
                if midX >= field.minX - 40 && midX <= field.maxX + 40,
                   let value = axString(element, kAXValueAttribute as String, bytes: 2_048) ?? axString(element, kAXTitleAttribute as String, bytes: 2_048) {
                    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !trimmed.isEmpty { found.append((frame, trimmed)) }
                }
            }
            continue
        }
        if depth < 30 {
            for child in readChildren(element, remaining: 1_500 - visited).reversed() { stack.append((child, depth + 1)) }
        }
    }
    found.sort { left, right in
        abs(left.0.minY - right.0.minY) > 4 ? left.0.minY < right.0.minY : left.0.minX < right.0.minX
    }
    var lines: [String] = []
    for (_, line) in found where lines.last != line { lines.append(line) }
    var joined = lines.joined(separator: "\n")
    while joined.utf8.count > focusTailBytes, let newline = joined.firstIndex(of: "\n") {
        joined = String(joined[joined.index(after: newline)...])
    }
    return bounded(joined, bytes: focusTailBytes)
}

private func strippedWindowTitle(_ title: String, appName: String) -> String {
    var result = title.trimmingCharacters(in: .whitespacesAndNewlines)
    for suffix in [" - Google Chrome", " - Safari", " — Mozilla Firefox", " - Microsoft Edge", " - Brave", " - Arc", " – Safari"] where result.hasSuffix(suffix) {
        result = String(result.dropLast(suffix.count))
    }
    if result.caseInsensitiveCompare(appName) == .orderedSame { return "" }
    return result
}

private func recipientHint(appID: String, appName: String, title: String) -> String? {
    let id = appID.lowercased()
    if id == "com.tinyspeck.slackmacgap" {
        // "Priya Sharma (DM) - Acme - Slack" or "#general (Channel) - Acme - Slack"
        var head = title.components(separatedBy: " - ").first ?? ""
        for tag in [" (DM)", " (Channel)", " (Private)", " (Group)", " (Thread)"] { head = head.replacingOccurrences(of: tag, with: "") }
        head = head.trimmingCharacters(in: .whitespaces)
        return head.isEmpty || head.lowercased() == "slack" ? nil : head
    }
    if id == "com.apple.mobilesms" {
        let value = title.trimmingCharacters(in: .whitespaces)
        return value.isEmpty || value == "Messages" ? nil : value
    }
    if id == "com.apple.mail" {
        let value = strippedWindowTitle(title, appName: appName)
        return value.isEmpty ? nil : "Email: \(value)"
    }
    let value = strippedWindowTitle(title, appName: appName)
    return value.isEmpty ? nil : value
}

// Reads the selection by copying it, then restores the pasteboard. Used only when AX
// exposes no selected text and the focus is not an editable field.
private func pasteboardSnapshot() -> [[(NSPasteboard.PasteboardType, Data)]] {
    (NSPasteboard.general.pasteboardItems ?? []).map { item in
        item.types.compactMap { type in item.data(forType: type).map { (type, $0) } }
    }
}

private func restorePasteboard(_ snapshot: [[(NSPasteboard.PasteboardType, Data)]]) {
    let board = NSPasteboard.general
    board.clearContents()
    let items: [NSPasteboardItem] = snapshot.map { entries in
        let item = NSPasteboardItem()
        for (type, data) in entries { item.setData(data, forType: type) }
        item.setData(Data(), forType: NSPasteboard.PasteboardType("org.nspasteboard.TransientType"))
        return item
    }
    if !items.isEmpty { board.writeObjects(items) }
}

private func postKey(_ virtualKey: CGKeyCode, flags: CGEventFlags = [], pid: pid_t? = nil) {
    let source = CGEventSource(stateID: .hidSystemState)
    for down in [true, false] {
        guard let event = CGEvent(keyboardEventSource: source, virtualKey: virtualKey, keyDown: down) else { continue }
        event.flags = flags
        if let pid { event.postToPid(pid) } else { event.post(tap: .cghidEventTap) }
    }
}

private func selectionByCopying() -> String? {
    let board = NSPasteboard.general
    let snapshot = pasteboardSnapshot()
    let before = board.changeCount
    postKey(8, flags: .maskCommand) // C
    let stop = DispatchTime.now().uptimeNanoseconds + 150_000_000
    while board.changeCount == before && DispatchTime.now().uptimeNanoseconds < stop { usleep(8_000) }
    let copied = board.changeCount != before ? board.string(forType: .string) : nil
    restorePasteboard(snapshot)
    return copied.map { String($0.prefix(focusSelectionLimit)) }
}

private func readFocus() -> Never {
    deadline = DispatchTime.now().uptimeNanoseconds + 900_000_000
    let field: FieldRead
    do { field = try readFocusedField(readText: true) } catch FocusFailure.skipped(let reason) { skip(reason) } catch { skip("focus_unavailable") }
    var selected = field.selectedText
    if selected.isEmpty && !field.editable && CommandLine.arguments.contains("--copy-fallback") {
        let uncertainRole = ["", "AXWebArea", "AXGroup", "AXUnknown", "unknown"].contains(field.role)
        if (field.selection?.length ?? 0) > 0 || uncertainRole { selected = selectionByCopying() ?? "" }
    }
    var before = "", after = ""
    if field.editable, let text = field.text, let selection = field.selection {
        let ns = text as NSString
        var start = max(0, selection.location - focusTextBeforeLimit)
        if start > 0 && start < ns.length { start = ns.rangeOfComposedCharacterSequence(at: start).location }
        before = ns.substring(with: NSRange(location: start, length: min(selection.location, ns.length) - start))
        let endOfSelection = min(ns.length, selection.location + selection.length)
        var afterLength = min(focusTextAfterLimit, ns.length - endOfSelection)
        if afterLength > 0 && endOfSelection + afterLength < ns.length {
            afterLength = ns.rangeOfComposedCharacterSequence(at: endOfSelection + afterLength - 1).upperBound - endOfSelection
        }
        after = afterLength > 0 ? ns.substring(with: NSRange(location: endOfSelection, length: afterLength)) : ""
        if selected.isEmpty, selection.length > 0 {
            selected = String(substringUTF16(text, location: selection.location, length: selection.length)?.prefix(focusSelectionLimit) ?? "")
        }
    }
    var tail = ""
    if field.editable, let window = field.window, let frame = rect(field.element) {
        tail = conversationTail(window: window, field: frame, budgetNanos: 160_000_000)
    }
    var context: [String: Any] = [
        "status": "ok",
        "app_id": field.appID,
        "app_name": field.appName,
        "window_title": bounded(field.windowTitle, bytes: 1_024),
        "url": field.url ?? NSNull(),
        "source_type": field.isBrowser ? (field.privateWindow ? "browser_private" : "browser") : "app",
        "role": field.role,
        "editable": field.editable && field.text != nil && field.selection != nil,
        "multiline": field.multiline,
        "text_before_caret": before,
        "text_after_caret": after,
        "selected_text": selected,
        "conversation_tail": tail,
        "recipient_hint": recipientHint(appID: field.appID, appName: field.appName, title: field.windowTitle) ?? NSNull()
    ]
    if let target = targetRevision(field) { context["target"] = target }
    emit(context)
}

private func readTarget() -> Never {
    deadline = DispatchTime.now().uptimeNanoseconds + 900_000_000
    let field: FieldRead
    do { field = try readFocusedField(readText: true) } catch FocusFailure.skipped(let reason) { skip(reason) } catch { skip("focus_unavailable") }
    let secure = false // secure fields are refused while reading
    guard let target = targetRevision(field), let text = field.text else {
        emit(["status": "ok", "found": false])
    }
    emit(["status": "ok", "found": true, "text": text, "writable": true, "secure": secure,
          "plain_text": true, "exact_range_write": true, "revision": target])
}

private func typeUnicode(_ text: String, pid: pid_t) {
    let source = CGEventSource(stateID: .hidSystemState)
    let units = Array(text.utf16)
    var index = 0
    while index < units.count {
        var end = min(index + 20, units.count)
        // Never split a surrogate pair across two events.
        if end < units.count, UTF16.isLeadSurrogate(units[end - 1]) { end -= 1 }
        var chunk = Array(units[index..<end])
        for down in [true, false] {
            guard let event = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: down) else { continue }
            event.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: &chunk)
            event.postToPid(pid)
        }
        index = end
        usleep(4_000)
    }
}

private func waitForText(_ element: AXUIElement, equals expected: String, milliseconds: Int) -> Bool {
    let stop = DispatchTime.now().uptimeNanoseconds + UInt64(milliseconds) * 1_000_000
    repeat {
        if let current = axValue(element, kAXValueAttribute as String) as? String, current == expected { return true }
        usleep(25_000)
    } while DispatchTime.now().uptimeNanoseconds < stop
    return (axValue(element, kAXValueAttribute as String) as? String) == expected
}

private func replaceSelection() -> Never {
    deadline = DispatchTime.now().uptimeNanoseconds + 3_000_000_000
    let input = readStandardInputJSON()
    guard let selectionInput = input["selection"] as? [String: Any],
          let start = selectionInput["start"] as? Int, let end = selectionInput["end"] as? Int, start >= 0, end >= start,
          let replacement = input["replacement"] as? String, replacement.count <= 24_000 else { skip("invalid_request") }
    let allowPaste = input["allow_paste"] as? Bool ?? false
    let field: FieldRead
    do { field = try readFocusedField(readText: true) } catch FocusFailure.skipped(let reason) { skip(reason) } catch { skip("focus_unavailable") }
    guard field.editable, let current = field.text else { skip("not_editable") }
    let ns = current as NSString
    guard end <= ns.length else { skip("selection_out_of_range") }
    let expected = ns.replacingCharacters(in: NSRange(location: start, length: end - start), with: replacement)
    let lowerApp = field.appID.lowercased()
    let typingFirst = typingFirstApps.contains { lowerApp.hasPrefix($0) }

    if !typingFirst {
        if setAXRange(field.element, location: start, length: end - start),
           AXUIElementSetAttributeValue(field.element, kAXSelectedTextAttribute as CFString, replacement as CFString) == .success,
           waitForText(field.element, equals: expected, milliseconds: 250) {
            emit(["status": "ok", "strategy": "ax"])
        }
        // If the write changed the field in some other way, stop rather than type on top of it.
        if let now = axValue(field.element, kAXValueAttribute as String) as? String, now != current, now != expected { skip("field_changed") }
        if (axValue(field.element, kAXValueAttribute as String) as? String) == expected { emit(["status": "ok", "strategy": "ax"]) }
    }

    guard setAXRange(field.element, location: start, length: end - start) else {
        if allowPaste { pasteReplacement(field: field, replacement: replacement, expected: expected) }
        skip("selection_not_settable")
    }
    if replacement.contains("\n") || replacement.contains("\r") {
        // Return is never typed. Multi-line text can only go in by paste, and only when allowed.
        if allowPaste { pasteReplacement(field: field, replacement: replacement, expected: expected) }
        skip("newline_requires_paste")
    }
    if replacement.isEmpty { postKey(51, pid: field.pid) } else { typeUnicode(replacement, pid: field.pid) }
    if waitForText(field.element, equals: expected, milliseconds: 500) { emit(["status": "ok", "strategy": "typing"]) }
    if allowPaste { pasteReplacement(field: field, replacement: replacement, expected: expected) }
    skip("write_not_confirmed")
}

private func pasteReplacement(field: FieldRead, replacement: String, expected: String) -> Never {
    let board = NSPasteboard.general
    let snapshot = pasteboardSnapshot()
    board.clearContents()
    let item = NSPasteboardItem()
    item.setString(replacement, forType: .string)
    item.setData(Data(), forType: NSPasteboard.PasteboardType("org.nspasteboard.TransientType"))
    board.writeObjects([item])
    postKey(9, flags: .maskCommand, pid: field.pid) // V
    let confirmed = waitForText(field.element, equals: expected, milliseconds: 600)
    restorePasteboard(snapshot)
    if confirmed { emit(["status": "ok", "strategy": "paste"]) }
    skip("write_not_confirmed")
}

let arguments = Set(CommandLine.arguments.dropFirst())
if arguments.contains("--permission") {
    emit(["permission": AXIsProcessTrusted() ? "granted" : "not_granted"])
}
if arguments.contains("--request-permission") {
    let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
    let options = [key: true] as CFDictionary
    emit(["permission": AXIsProcessTrustedWithOptions(options) ? "granted" : "not_granted"])
}
if arguments.contains("--read-frontmost") { readFrontmost() }
if arguments.contains("--focus") { readFocus() }
if arguments.contains("--read-target") { readTarget() }
if arguments.contains("--replace-selection") { replaceSelection() }
skip("unsupported_command")
