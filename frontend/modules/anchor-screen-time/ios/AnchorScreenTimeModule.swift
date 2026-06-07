import ExpoModulesCore
import FamilyControls
import ManagedSettings
import SwiftUI
import UIKit

private let kSelectionKey = "anchor.screenTime.familyActivitySelection"
private let kStoreSuffix  = "anchor.focus.shield"

@available(iOS 16.0, *)
private enum SelectionStore {
  static func load() -> FamilyActivitySelection? {
    guard let data = UserDefaults.standard.data(forKey: kSelectionKey) else { return nil }
    return try? PropertyListDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  static func save(_ selection: FamilyActivitySelection) {
    if let data = try? PropertyListEncoder().encode(selection) {
      UserDefaults.standard.set(data, forKey: kSelectionKey)
    }
  }

  static func clear() {
    UserDefaults.standard.removeObject(forKey: kSelectionKey)
  }
}

@available(iOS 16.0, *)
private final class SelectionBox: ObservableObject {
  @Published var value: FamilyActivitySelection
  init(_ initial: FamilyActivitySelection) { self.value = initial }
}

@available(iOS 16.0, *)
private struct PickerHost: View {
  @ObservedObject var box: SelectionBox
  let onDone:   () -> Void
  let onCancel: () -> Void

  var body: some View {
    NavigationView {
      FamilyActivityPicker(selection: $box.value)
        .navigationTitle("Block Apps")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("Cancel", action: onCancel)
          }
          ToolbarItem(placement: .confirmationAction) {
            Button("Done", action: onDone).bold()
          }
        }
    }
  }
}

public class AnchorScreenTimeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AnchorScreenTime")

    AsyncFunction("getAuthorizationStatus") { () -> String in
      if #available(iOS 16.0, *) {
        return Self.statusString(AuthorizationCenter.shared.authorizationStatus)
      }
      return "unsupported"
    }

    AsyncFunction("requestAuthorization") { (promise: Promise) in
      if #available(iOS 16.0, *) {
        Task { @MainActor in
          do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
            promise.resolve(Self.statusString(AuthorizationCenter.shared.authorizationStatus))
          } catch {
            promise.reject("ERR_FAMILY_CONTROLS_AUTH", error.localizedDescription)
          }
        }
      } else {
        promise.resolve("unsupported")
      }
    }

    AsyncFunction("presentPicker") { (promise: Promise) in
      if #available(iOS 16.0, *) {
        Task { @MainActor in
          guard let presenter = Self.topViewController() else {
            promise.reject("ERR_NO_PRESENTER", "No view controller to present from")
            return
          }
          let box = SelectionBox(SelectionStore.load() ?? FamilyActivitySelection())
          var holder: UIHostingController<PickerHost>?
          var resolved = false
          let view = PickerHost(
            box: box,
            onDone: {
              if resolved { return }
              resolved = true
              holder?.dismiss(animated: true) {
                SelectionStore.save(box.value)
                promise.resolve(Self.summarize(box.value))
              }
            },
            onCancel: {
              if resolved { return }
              resolved = true
              holder?.dismiss(animated: true) {
                promise.resolve(NSNull())
              }
            }
          )
          let host = UIHostingController(rootView: view)
          host.modalPresentationStyle = .formSheet
          holder = host
          presenter.present(host, animated: true)
        }
      } else {
        promise.reject("ERR_UNSUPPORTED", "Family Controls requires iOS 16+")
      }
    }

    AsyncFunction("getSelectionSummary") { () -> Any in
      if #available(iOS 16.0, *), let selection = SelectionStore.load() {
        return Self.summarize(selection)
      }
      return NSNull()
    }

    AsyncFunction("hasSelection") { () -> Bool in
      if #available(iOS 16.0, *), let selection = SelectionStore.load() {
        return !selection.applicationTokens.isEmpty
            || !selection.categoryTokens.isEmpty
            || !selection.webDomainTokens.isEmpty
      }
      return false
    }

    AsyncFunction("clearSelection") {
      if #available(iOS 16.0, *) {
        SelectionStore.clear()
      }
    }

    AsyncFunction("applyShield") { (promise: Promise) in
      if #available(iOS 16.0, *) {
        guard AuthorizationCenter.shared.authorizationStatus == .approved else {
          promise.reject("ERR_NOT_AUTHORIZED", "Screen Time authorization not approved")
          return
        }
        guard let selection = SelectionStore.load() else {
          promise.reject("ERR_NO_SELECTION", "No apps selected to block")
          return
        }
        let store = ManagedSettingsStore(named: ManagedSettingsStore.Name(kStoreSuffix))
        store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
        store.shield.applicationCategories = selection.categoryTokens.isEmpty
          ? nil
          : .specific(selection.categoryTokens, except: [])
        store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
        promise.resolve(nil)
      } else {
        promise.reject("ERR_UNSUPPORTED", "Family Controls requires iOS 16+")
      }
    }

    AsyncFunction("clearShield") {
      if #available(iOS 16.0, *) {
        let store = ManagedSettingsStore(named: ManagedSettingsStore.Name(kStoreSuffix))
        store.shield.applications = nil
        store.shield.applicationCategories = nil
        store.shield.webDomains = nil
      }
    }
  }

  @available(iOS 16.0, *)
  private static func statusString(_ status: AuthorizationStatus) -> String {
    switch status {
    case .notDetermined: return "notDetermined"
    case .denied:        return "denied"
    case .approved:      return "approved"
    @unknown default:    return "unknown"
    }
  }

  @available(iOS 16.0, *)
  private static func summarize(_ selection: FamilyActivitySelection) -> [String: Int] {
    [
      "applicationCount": selection.applicationTokens.count,
      "categoryCount":    selection.categoryTokens.count,
      "webDomainCount":   selection.webDomainTokens.count,
    ]
  }

  @MainActor
  private static func topViewController(base: UIViewController? = nil) -> UIViewController? {
    let root = base ?? UIApplication.shared.connectedScenes
      .compactMap { ($0 as? UIWindowScene)?.keyWindow }
      .first?.rootViewController
    if let nav = root as? UINavigationController {
      return topViewController(base: nav.visibleViewController)
    }
    if let tab = root as? UITabBarController, let selected = tab.selectedViewController {
      return topViewController(base: selected)
    }
    if let presented = root?.presentedViewController {
      return topViewController(base: presented)
    }
    return root
  }
}
