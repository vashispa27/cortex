import AppKit
import ApplicationServices
import Foundation
Darwin.setbuf(stdout, nil)

// Explicit feasibility probe. Never reads the user's foreground window or writes
// another application's field. --synthetic creates a harmless own-process field.
let arguments = Set(CommandLine.arguments.dropFirst())
print("AX permission: \(AXIsProcessTrusted() ? "granted" : "not granted")")
guard arguments.contains("--synthetic") else { exit(0) }

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 420, height: 140), styleMask: [.titled, .closable], backing: .buffered, defer: false)
window.title = "Rewind Independent Synthetic AX Fixture"
let field = NSTextField(frame: NSRect(x: 20, y: 55, width: 360, height: 28))
field.stringValue = "Synthetic hello 👋"
field.isEditable = true
window.contentView?.addSubview(field)
window.makeKeyAndOrderFront(nil)
window.makeFirstResponder(field)
app.activate(ignoringOtherApps: true)

func children(_ element: AXUIElement) -> [AXUIElement] {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &value) == .success,
          let items = value as? [AXUIElement] else { return [] }
    return items
}
func role(_ element: AXUIElement) -> String {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &value) == .success else { return "unknown" }
    return value as? String ?? "unknown"
}
func findTextField(_ element: AXUIElement, depth: Int = 0) -> AXUIElement? {
    guard depth < 12 else { return nil }
    if role(element) == kAXTextFieldRole as String { return element }
    for child in children(element) {
        if let match = findTextField(child, depth: depth + 1) { return match }
    }
    return nil
}

DispatchQueue.global().asyncAfter(deadline: .now() + 0.7) {
    let element = AXUIElementCreateApplication(getpid())
    AXUIElementSetMessagingTimeout(element, 2)
    var windowsValue: CFTypeRef?
    let windowsError = AXUIElementCopyAttributeValue(element, kAXWindowsAttribute as CFString, &windowsValue)
    guard windowsError == .success,
          let windows = windowsValue as? [AXUIElement],
          let first = windows.first,
          let target = findTextField(first) else {
        print("Synthetic AX read unavailable (error \(windowsError.rawValue)); permission or provider support required")
        exit(2)
    }
    var value: CFTypeRef?
    let readError = AXUIElementCopyAttributeValue(target, kAXValueAttribute as CFString, &value)
    print("Synthetic AX read: \(readError == .success ? "success" : "failed")")
    if readError == .success, let text = value as? String, text == "Synthetic hello 👋" {
        guard AXIsProcessTrusted() else {
            print("Synthetic AX write skipped: Accessibility permission is not granted")
            exit(4)
        }
        var writable = DarwinBoolean(false)
        let writableError = AXUIElementIsAttributeSettable(target, kAXValueAttribute as CFString, &writable)
        if writableError == .success && writable.boolValue {
            let writeError = AXUIElementSetAttributeValue(target, kAXValueAttribute as CFString, "Synthetic updated 👋" as CFTypeRef)
            var verified: CFTypeRef?
            let verifyError = AXUIElementCopyAttributeValue(target, kAXValueAttribute as CFString, &verified)
            print("Synthetic AX write and verify: \(writeError == .success && verifyError == .success && (verified as? String) == "Synthetic updated 👋" ? "success" : "failed")")
            exit(writeError == .success && verifyError == .success && (verified as? String) == "Synthetic updated 👋" ? 0 : 3)
        }
        print("Synthetic AX write unsupported by provider")
        exit(4)
    }
    exit(5)
}
DispatchQueue.main.asyncAfter(deadline: .now() + 6) {
    print("Synthetic AX probe timed out; provider or permission did not respond")
    exit(6)
}
app.run()
