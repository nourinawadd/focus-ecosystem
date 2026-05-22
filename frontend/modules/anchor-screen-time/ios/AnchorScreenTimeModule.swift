import ExpoModulesCore
import FamilyControls
import ManagedSettings
import SwiftUI
import UIKit

private let kSelectionKey = "anchor.screenTime.familyActivitySelection"
private let kStoreName = ManagedSettingsStore.Name("anchor.focus.shield")

@available(iOS 16.0, *)
private final class SelectionStore {
  static let shared = SelectionStore()

  func load() -> FamilyActivitySelection? {
    guard let data = UserDefaults.standard.data(forKey: kSelectionKey) else { return nil }
    return try? PropertyListDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  func save(_ selection: FamilyActivitySelection) {
    let data = try? PropertyListEncoder().encode(selection)
    UserDefaults.standard.set(data, forKey: kSelectionKey)
  }

  func clear() {
    UserDefaults.standard.removeObject(forKey: kSelectionKey)
  }
}

@available(iOS 16.0, *)
private struct PickerHost: View {
  @Binding var selection: FamilyActivitySelection
  let onDone: () -> Void
  let onCancel: () -> Void

  var body: some View {
    NavigationView {
      FamilyActivityPicker(selection: $selection)
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

@available(iOS 16.0, *)
private final class SelectionBox: ObservableObject {
  @Published var value: FamilyActivitySelection

  init(_ initial: FamilyActivitySelection) {
    self.value = initial
  }
}

@available(iOS 16.0, *)
private final class PickerHostingController: UIHostingController<AnyView> {
  var onFinished: ((FamilyActivitySelection?) -> Void)?
  let box: SelectionBox

  init(initial: FamilyActivitySelection) {
    self.box = SelectionBox(initial)
    super.init(rootView: AnyView(EmptyView()))

    let box = self.box
    self.rootView = AnyView(
      PickerHost(
        selection: Binding(get: { box.value }, set: { box.value = $0 }),
        onDone: { [weak self] in
          self?.dismiss(animated: true) {
            self?.onFinished?(box.value)
          }
        },
        onCancel: { [weak self] in
          self?.dismiss(animated: true) {
            self?.onFinished?(nil)
          }
        }
      )
    )
  }

  @MainActor required dynamic init?(coder aDecoder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
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
      guard #available(iOS 16.0, *) else {
        promise.resolve("unsupported")
        return
      }
      Task { @MainActor in
        do {
          try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
          promise.resolve(Self.statusString(AuthorizationCenter.shared.authorizationStatus))
        } catch {
          promise.reject("ERR_FAMILY_CONTROLS_AUTH", error.localizedDescription)
        }
      }
    }

    AsyncFunction("presentPicker") { (promise: Promise) in
      guard #available(iOS 16.0, *) else {
        promise.reject("ERR_UNSUPPORTED", "Family Controls requires iOS 16+")
        return
      }
      Task { @MainActor in
        guard let presenter = Self.topViewController() else {
          promise.reject("ERR_NO_PRESENTER", "Could not find a view controller to present from")
          return
        }
        let initial = SelectionStore.shared.load() ?? FamilyActivitySelection()
        let host = PickerHostingController(initial: initial)
        host.modalPresentationStyle = .formSheet
        host.onFinished = { selection in
          if let selection = selection {
            SelectionStore.shared.save(selection)
            promise.resolve(Self.summarize(selection))
          } else {
            promise.resolve(NSNull())
          }
        }
        presenter.present(host, animated: true)
      }
    }

    AsyncFunction("getSelectionSummary") { () -> Any in
      guard #available(iOS 16.0, *), let selection = SelectionStore.shared.load() else {
        return NSNull()
      }
      return Self.summarize(selection)
    }

    AsyncFunction("hasSelection") { () -> Bool in
      guard #available(iOS 16.0, *), let selection = SelectionStore.shared.load() else {
        return false
      }
      return !selection.applicationTokens.isEmpty ||
             !selection.categoryTokens.isEmpty ||
             !selection.webDomainTokens.isEmpty
    }

    AsyncFunction("clearSelection") { () in
      if #available(iOS 16.0, *) {
        SelectionStore.shared.clear()
      }
    }

    AsyncFunction("applyShield") { (promise: Promise) in
      guard #available(iOS 16.0, *) else {
        promise.reject("ERR_UNSUPPORTED", "Family Controls requires iOS 16+")
        return
      }
      guard AuthorizationCenter.shared.authorizationStatus == .approved else {
        promise.reject("ERR_NOT_AUTHORIZED", "Screen Time authorization is not approved")
        return
      }
      guard let selection = SelectionStore.shared.load() else {
        promise.reject("ERR_NO_SELECTION", "No apps have been selected to block")
        return
      }
      let store = ManagedSettingsStore(named: kStoreName)
      store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
      store.shield.applicationCategories = selection.categoryTokens.isEmpty
        ? nil
        : .specific(selection.categoryTokens)
      store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
      promise.resolve(nil)
    }

    AsyncFunction("clearShield") { () in
      if #available(iOS 16.0, *) {
        let store = ManagedSettingsStore(named: kStoreName)
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
    return [
      "applicationCount": selection.applicationTokens.count,
      "categoryCount":    selection.categoryTokens.count,
      "webDomainCount":   selection.webDomainTokens.count,
    ]
  }

  @MainActor
  private static func topViewController(base: UIViewController? = nil) -> UIViewController? {
    let root = base
      ?? UIApplication.shared.connectedScenes
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
