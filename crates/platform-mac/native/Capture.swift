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
private let deadline = DispatchTime.now().uptimeNanoseconds + 750_000_000

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
    return (nodes, url, limitations)
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
skip("unsupported_command")
