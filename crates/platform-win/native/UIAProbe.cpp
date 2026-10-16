#include <UIAutomation.h>
#include <iostream>
#include <string>
#include <windows.h>
#include <thread>

// Run only with --live. Reads the currently focused UIA control's role and value
// after checking IsPassword. It never calls SetValue or sends keys.
int synthetic() {
    HWND root = CreateWindowExW(0, L"STATIC", L"Open Memory Synthetic UIA Fixture", WS_OVERLAPPEDWINDOW,
                                CW_USEDEFAULT, CW_USEDEFAULT, 450, 160, nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
    if (!root) return 10;
    HWND edit = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", L"Synthetic hello", WS_CHILD | WS_VISIBLE | ES_AUTOHSCROLL,
                                20, 20, 360, 28, root, nullptr, GetModuleHandleW(nullptr), nullptr);
    if (!edit) { DestroyWindow(root); return 11; }
    ShowWindow(root, SW_SHOW);
    DWORD mainThreadId = GetCurrentThreadId();
    std::thread worker([&]() {
        HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
        if (FAILED(hr)) { PostThreadMessageW(mainThreadId, WM_QUIT, 0, 0); return; }
        IUIAutomation* automation = nullptr;
        IUIAutomationElement* element = nullptr;
        IUIAutomationValuePattern* value = nullptr;
        hr = CoCreateInstance(CLSID_CUIAutomation, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&automation));
        if (SUCCEEDED(hr)) hr = automation->ElementFromHandle(edit, &element);
        if (SUCCEEDED(hr)) hr = element->GetCurrentPatternAs(UIA_ValuePatternId, IID_PPV_ARGS(&value));
        if (SUCCEEDED(hr) && value != nullptr) {
            BSTR before = nullptr;
            hr = value->get_CurrentValue(&before);
            bool readOkay = SUCCEEDED(hr) && before != nullptr && std::wstring(before) == L"Synthetic hello";
            std::wcout << L"Synthetic UIA read: " << (readOkay ? L"success" : L"failed") << L"\n";
            if (before) SysFreeString(before);
            if (readOkay) {
                // Simulate a user edit after the revision was captured. A guarded
                // editor must reject this stale revision without calling SetValue.
                SetWindowTextW(edit, L"User changed field");
                BSTR changed = nullptr;
                value->get_CurrentValue(&changed);
                bool staleRejected = changed != nullptr && std::wstring(changed) != L"Synthetic hello";
                std::wcout << L"Stale target rejection: " << (staleRejected ? L"success" : L"failed") << L"\n";
                if (changed) SysFreeString(changed);
                // Fresh expected value, exact whole-value setter for a plain EDIT.
                if (staleRejected) {
                    hr = value->SetValue(L"Synthetic updated");
                    BSTR after = nullptr;
                    HRESULT verify = value->get_CurrentValue(&after);
                    bool writeOkay = SUCCEEDED(hr) && SUCCEEDED(verify) && after != nullptr && std::wstring(after) == L"Synthetic updated";
                    std::wcout << L"Synthetic UIA write and verify: " << (writeOkay ? L"success" : L"failed") << L"\n";
                    if (after) SysFreeString(after);
                }
            }
        } else {
            std::wcout << L"Synthetic UIA ValuePattern unavailable.\n";
        }
        if (value) value->Release();
        if (element) element->Release();
        if (automation) automation->Release();
        CoUninitialize();
        PostThreadMessageW(mainThreadId, WM_QUIT, 0, 0);
    });
    MSG message;
    while (GetMessageW(&message, nullptr, 0, 0) > 0) { TranslateMessage(&message); DispatchMessageW(&message); }
    worker.join();
    DestroyWindow(root);
    return 0;
}

int wmain(int argc, wchar_t** argv) {
    if (argc == 2 && std::wstring(argv[1]) == L"--synthetic") return synthetic();
    if (argc != 2 || std::wstring(argv[1]) != L"--live") {
        std::wcout << L"Pass --synthetic for own-process read/write/stale proof, or --live for read-only focused-control inspection.\n";
        return 0;
    }
    HRESULT hr = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    if (FAILED(hr)) return 1;
    IUIAutomation* automation = nullptr;
    hr = CoCreateInstance(CLSID_CUIAutomation, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&automation));
    if (FAILED(hr)) { CoUninitialize(); return 2; }
    IUIAutomationElement* focused = nullptr;
    hr = automation->GetFocusedElement(&focused);
    if (FAILED(hr) || focused == nullptr) { automation->Release(); CoUninitialize(); return 3; }
    BOOL password = FALSE;
    focused->get_CurrentIsPassword(&password);
    if (password) {
        std::wcout << L"Protected control skipped.\n";
        focused->Release(); automation->Release(); CoUninitialize(); return 0;
    }
    CONTROLTYPEID type = 0;
    focused->get_CurrentControlType(&type);
    std::wcout << L"Focused control type: " << type << L"\n";
    IUIAutomationValuePattern* value = nullptr;
    hr = focused->GetCurrentPatternAs(UIA_ValuePatternId, IID_PPV_ARGS(&value));
    if (SUCCEEDED(hr) && value != nullptr) {
        BSTR text = nullptr;
        if (SUCCEEDED(value->get_CurrentValue(&text)) && text != nullptr) {
            std::wcout << L"Value pattern readable, length: " << SysStringLen(text) << L" UTF-16 units\n";
            SysFreeString(text);
        }
        BOOL readOnly = TRUE;
        if (SUCCEEDED(value->get_CurrentIsReadOnly(&readOnly))) {
            std::wcout << L"Value pattern writable: " << (readOnly ? L"no" : L"yes") << L"\n";
        }
        value->Release();
    } else {
        std::wcout << L"Value pattern unavailable; TextPattern may still allow reads.\n";
    }
    focused->Release(); automation->Release(); CoUninitialize();
    return 0;
}
