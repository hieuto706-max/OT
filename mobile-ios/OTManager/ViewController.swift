import UIKit
import WebKit
import Network
import Darwin

class ViewController: UIViewController {

    private var webView: WKWebView!

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 2/255, green: 2/255, blue: 5/255, alpha: 1) // #020205

        setupWebView()
        loadLocalContent()
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }

    override var prefersStatusBarHidden: Bool {
        return false
    }

    // MARK: - WebView Setup

    private func setupWebView() {
        let config = WKWebViewConfiguration()

        // Bật localStorage & DOM Storage
        config.websiteDataStore = WKWebsiteDataStore.default()

        // Cho phép inline media playback (tránh fullscreen video trên iPhone)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // JavaScript Bridge: đăng ký message handler "iOSBridge"
        let contentController = WKUserContentController()
        contentController.add(self, name: "iOSBridge")
        config.userContentController = contentController

        // Inject script để tạo window.iOSBridge tương thích với AndroidBridge
        let bridgeScript = WKUserScript(
            source: """
            // Tạo cầu nối giữa JavaScript và Swift (tương đương AndroidBridge trên Android)
            window.iOSBridge = {
                startAutoDiscovery: function() {
                    window.webkit.messageHandlers.iOSBridge.postMessage({action: 'startAutoDiscovery'});
                }
            };
            // Đặt flag để JS biết đang chạy trên iOS native app
            window.__IS_IOS_APP__ = true;

            // Tương thích ngược: nếu code JS gọi AndroidBridge, chuyển qua iOSBridge
            if (!window.AndroidBridge) {
                window.AndroidBridge = window.iOSBridge;
            }
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        contentController.addUserScript(bridgeScript)

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.scrollView.bounces = true
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic

        // Cho phép vuốt quay lại (swipe-back navigation)
        webView.allowsBackForwardNavigationGestures = true

        // Background trong suốt để khớp với dark theme
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 2/255, green: 2/255, blue: 5/255, alpha: 1)
        webView.scrollView.backgroundColor = UIColor(red: 2/255, green: 2/255, blue: 5/255, alpha: 1)

        // Auto Layout
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
    }

    // MARK: - Load Content

    private func loadLocalContent() {
        guard let wwwPath = Bundle.main.path(forResource: "index", ofType: "html", inDirectory: "www") else {
            showAlert(title: "Lỗi", message: "Không tìm thấy file index.html trong thư mục www.")
            return
        }
        let wwwURL = URL(fileURLWithPath: wwwPath)
        let wwwDir = wwwURL.deletingLastPathComponent()
        webView.loadFileURL(wwwURL, allowingReadAccessTo: wwwDir)
    }

    // MARK: - Auto Discover Server (quét mạng WiFi tìm server OT Manager)

    private func autoDiscoverServer() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }

            // 1. Thử kết nối Render Cloud Server trước
            let cloudUrl = "https://ot-manager-server-jbxd.onrender.com"
            if self.isServerReachable(host: "ot-manager-server-jbxd.onrender.com", port: 443, timeout: 5.0) {
                DispatchQueue.main.async {
                    self.sendServerDiscovered(serverUrl: cloudUrl)
                }
                return
            }

            // 2. Quét subnet WiFi nội bộ cổng 3456
            let port: UInt16 = 3456
            guard let localIP = self.getWiFiIPAddress() else { return }

            if let serverIP = self.discoverServerIP(localIP: localIP, port: port) {
                let serverUrl = "http://\(serverIP):\(port)"
                DispatchQueue.main.async {
                    self.sendServerDiscovered(serverUrl: serverUrl)
                }
            }
        }
    }

    private func sendServerDiscovered(serverUrl: String) {
        let js = """
        if (typeof window.onServerDiscovered === 'function') {
            window.onServerDiscovered('\(serverUrl)');
        } else {
            localStorage.setItem('ot_server_ip', '\(serverUrl)');
            if (typeof API !== 'undefined') API = '\(serverUrl)';
            if (typeof showToast === 'function') showToast('Đã tự động kết nối: \(serverUrl)', 'success');
        }
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    // MARK: - Network Utilities

    private func getWiFiIPAddress() -> String? {
        var address: String?
        var ifaddr: UnsafeMutablePointer<ifaddrs>?

        guard getifaddrs(&ifaddr) == 0 else { return nil }
        guard let firstAddr = ifaddr else { return nil }

        for ptr in sequence(first: firstAddr, next: { $0.pointee.ifa_next }) {
            let interface = ptr.pointee
            let addrFamily = interface.ifa_addr.pointee.sa_family

            if addrFamily == UInt8(AF_INET) {
                let name = String(cString: interface.ifa_name)
                if name == "en0" { // en0 = WiFi interface trên iOS
                    var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                    getnameinfo(interface.ifa_addr, socklen_t(interface.ifa_addr.pointee.sa_len),
                                &hostname, socklen_t(hostname.count),
                                nil, 0, NI_NUMERICHOST)
                    address = String(cString: hostname)
                }
            }
        }
        freeifaddrs(ifaddr)
        return address
    }

    private func isServerReachable(host: String, port: Int, timeout: TimeInterval) -> Bool {
        let semaphore = DispatchSemaphore(value: 0)
        var reachable = false

        let task = URLSession.shared.dataTask(with: URL(string: "https://\(host)/api/version")!) { data, response, error in
            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                reachable = true
            }
            semaphore.signal()
        }
        task.resume()
        _ = semaphore.wait(timeout: .now() + timeout)
        return reachable
    }

    private func discoverServerIP(localIP: String, port: UInt16) -> String? {
        guard let lastDotIndex = localIP.lastIndex(of: ".") else { return nil }
        let subnet = String(localIP[...lastDotIndex]) // "192.168.1."

        let dispatchGroup = DispatchGroup()
        let queue = DispatchQueue(label: "com.otmanager.scanner", attributes: .concurrent)
        var foundIP: String?
        let lock = NSLock()

        for host in 1...254 {
            dispatchGroup.enter()
            queue.async {
                defer { dispatchGroup.leave() }

                lock.lock()
                let alreadyFound = foundIP != nil
                lock.unlock()
                if alreadyFound { return }

                let ip = "\(subnet)\(host)"
                if self.isPortOpen(host: ip, port: port, timeout: 1.0) {
                    lock.lock()
                    if foundIP == nil {
                        foundIP = ip
                    }
                    lock.unlock()
                }
            }
        }

        _ = dispatchGroup.wait(timeout: .now() + 12)
        return foundIP
    }

    private func isPortOpen(host: String, port: UInt16, timeout: TimeInterval) -> Bool {
        let semaphore = DispatchSemaphore(value: 0)
        var success = false
        
        let hostName = NWEndpoint.Host(host)
        guard let portNumber = NWEndpoint.Port(rawValue: port) else { return false }
        let connection = NWConnection(host: hostName, port: portNumber, using: .tcp)
        
        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                success = true
                connection.cancel()
                semaphore.signal()
            case .failed:
                connection.cancel()
                semaphore.signal()
            case .waiting:
                break
            default:
                break
            }
        }
        
        connection.start(queue: DispatchQueue.global(qos: .userInitiated))
        
        _ = semaphore.wait(timeout: .now() + timeout)
        connection.cancel()
        
        return success
    }

    // MARK: - Helpers

    private func showAlert(title: String, message: String) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    private func showToast(message: String) {
        let toastLabel = UILabel()
        toastLabel.backgroundColor = UIColor.black.withAlphaComponent(0.8)
        toastLabel.textColor = .white
        toastLabel.font = UIFont.systemFont(ofSize: 14, weight: .medium)
        toastLabel.textAlignment = .center
        toastLabel.text = message
        toastLabel.alpha = 0
        toastLabel.layer.cornerRadius = 12
        toastLabel.clipsToBounds = true
        toastLabel.numberOfLines = 0

        let maxWidth = view.frame.width - 48
        let size = toastLabel.sizeThatFits(CGSize(width: maxWidth, height: CGFloat.greatestFiniteMagnitude))
        toastLabel.frame = CGRect(
            x: (view.frame.width - min(size.width + 32, maxWidth)) / 2,
            y: view.frame.height - 120,
            width: min(size.width + 32, maxWidth),
            height: size.height + 20
        )
        view.addSubview(toastLabel)

        UIView.animate(withDuration: 0.3, animations: {
            toastLabel.alpha = 1
        }) { _ in
            UIView.animate(withDuration: 0.3, delay: 2.0, options: [], animations: {
                toastLabel.alpha = 0
            }) { _ in
                toastLabel.removeFromSuperview()
            }
        }
    }
}

// MARK: - WKScriptMessageHandler (JavaScript Bridge)

extension ViewController: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "iOSBridge",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "startAutoDiscovery":
            autoDiscoverServer()
        default:
            print("⚠️ iOSBridge: Unknown action '\(action)'")
        }
    }
}

// MARK: - WKNavigationDelegate

extension ViewController: WKNavigationDelegate {

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {

        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        let urlString = url.absoluteString

        // Chặn tải file APK (không cần trên iOS)
        if urlString.hasSuffix(".apk") || urlString.contains("OT-Manager-mobile.apk") {
            showToast(message: "Bản cập nhật APK chỉ dành cho Android.")
            decisionHandler(.cancel)
            return
        }

        // Mở link ngoài (http/https không phải server nội bộ) bằng Safari
        if url.scheme == "http" || url.scheme == "https" {
            if navigationAction.navigationType == .linkActivated {
                // Chỉ mở bằng Safari nếu là link do người dùng click
                // và không phải API call
                let isExternalLink = !urlString.contains("onrender.com") &&
                                     !urlString.contains("localhost") &&
                                     !urlString.contains("192.168.")
                if isExternalLink {
                    UIApplication.shared.open(url)
                    decisionHandler(.cancel)
                    return
                }
            }
        }

        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Ẩn splash screen sau khi tải xong
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("❌ WebView navigation failed: \(error.localizedDescription)")
    }
}

// MARK: - WKUIDelegate (Alert/Confirm/Prompt)

extension ViewController: WKUIDelegate {

    // JavaScript alert() → UIAlertController
    func webView(_ webView: WKWebView,
                 runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler()
        })
        present(alert, animated: true)
    }

    // JavaScript confirm() → UIAlertController
    func webView(_ webView: WKWebView,
                 runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Huỷ", style: .cancel) { _ in
            completionHandler(false)
        })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler(true)
        })
        present(alert, animated: true)
    }

    // JavaScript prompt() → UIAlertController
    func webView(_ webView: WKWebView,
                 runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { textField in
            textField.text = defaultText
        }
        alert.addAction(UIAlertAction(title: "Huỷ", style: .cancel) { _ in
            completionHandler(nil)
        })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler(alert.textFields?.first?.text)
        })
        present(alert, animated: true)
    }
}
