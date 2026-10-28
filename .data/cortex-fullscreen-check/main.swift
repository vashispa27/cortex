import AppKit

final class Delegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var window: NSWindow!
    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 900, height: 600), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        let external = Bundle.main.object(forInfoDictionaryKey: "CortexExternalTest") as? Bool ?? false
        window.title = external ? "Cortex external full-screen verification" : "Cortex full-screen verification"
        if external, let screen = NSScreen.screens.last {
            window.setFrameOrigin(NSPoint(x: screen.frame.midX - 450, y: screen.frame.midY - 300))
        }
        Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in self.recordStatus() }
        window.delegate = self
        window.collectionBehavior = [.fullScreenPrimary]
        window.backgroundColor = NSColor(calibratedRed: 0.12, green: 0.23, blue: 0.38, alpha: 1)
        let label = NSTextField(labelWithString: "Cortex full-screen verification\nThe notch should remain visible at the top of this screen.")
        label.textColor = .white
        label.font = .systemFont(ofSize: 24)
        label.alignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(label)
        NSLayoutConstraint.activate([label.centerXAnchor.constraint(equalTo: window.contentView!.centerXAnchor), label.centerYAnchor.constraint(equalTo: window.contentView!.centerYAnchor)])
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.window.toggleFullScreen(nil) }
    }
    func recordStatus() {
        let external = Bundle.main.object(forInfoDictionaryKey: "CortexExternalTest") as? Bool ?? false
        let filename = external ? "status-external.txt" : "status.txt"
        let status = "full-screen=\(window.styleMask.contains(.fullScreen)) active-space=\(window.isOnActiveSpace) app-active=\(NSApp.isActive) key=\(window.isKeyWindow) frame=\(window.frame)\n"
        try? status.write(toFile: "/Users/abhinavvashisht/workspace/rewind/.data/cortex-fullscreen-check/" + filename, atomically: true, encoding: .utf8)
    }
    func windowDidEnterFullScreen(_ notification: Notification) { recordStatus() }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = Delegate()
app.delegate = delegate
app.run()
