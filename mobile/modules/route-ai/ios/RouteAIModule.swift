import ExpoModulesCore
import Foundation
import FoundationModels

private func routeAIError(_ code: String) -> NSError {
  NSError(domain: "RouteAI", code: 1, userInfo: [NSLocalizedDescriptionKey: code])
}

private func availability() -> String {
  guard #available(iOS 26.0, *) else { return "UNSUPPORTED_OS" }
  switch SystemLanguageModel.default.availability {
  case .available: return "AVAILABLE"
  case .unavailable(.deviceNotEligible): return "UNSUPPORTED_DEVICE"
  case .unavailable(.appleIntelligenceNotEnabled): return "APPLE_INTELLIGENCE_NOT_ENABLED"
  case .unavailable(.modelNotReady): return "MODEL_NOT_READY"
  case .unavailable: return "UNKNOWN"
  @unknown default: return "UNKNOWN"
  }
}

@available(iOS 26.0, *)
@Generable
private struct RouteDecision {
  @Guide(description: "Supported intent only", .anyOf(["QUERY_ROUTE_SUMMARY", "QUERY_DISTANCE", "QUERY_WAYPOINTS", "QUERY_WAYPOINT", "QUERY_EXPLANATION", "QUERY_BLOCKERS", "QUERY_AREAS", "QUERY_LONGEST_SEGMENT", "QUERY_COMPARISON", "MOVE_WAYPOINT", "ADD_WAYPOINT", "DELETE_WAYPOINT", "REORDER_WAYPOINT", "REPLAN", "REPLAN_AVOIDING_AREA", "UNDO", "NEED_CLARIFICATION"]))
  var intent: String
  @Guide(description: "Original waypoint reference, e.g. waypoint 2, last waypoint, this point; do not guess an ID")
  var waypointReference: String?
  var secondWaypointReference: String?
  var alternativeNumber: Int?
  var areaReference: String?
  @Guide(description: "Only explicitly supplied absolute X in inches, never calculate units")
  var absoluteXInches: Double?
  @Guide(description: "Only explicitly supplied absolute Y in inches, never calculate units")
  var absoluteYInches: Double?
  @Guide(description: "Original numerical distance, without converting units")
  var distanceValue: Double?
  @Guide(description: "Original unit: yards, feet, or inches")
  var distanceUnit: String?
  @Guide(description: "Original direction: left, right, up, down, forward, back")
  var direction: String?
  var clarificationText: String?
  @Guide(description: "Only user-supplied avoidance rectangle minimum X in inches")
  var areaMinXInches: Double?
  var areaMinYInches: Double?
  var areaMaxXInches: Double?
  var areaMaxYInches: Double?

  func json() throws -> String {
    var result: [String: Any] = ["intent": intent]
    if let value = waypointReference { result["waypointReference"] = value }
    if let value = secondWaypointReference { result["secondWaypointReference"] = value }
    if let value = alternativeNumber { result["alternativeNumber"] = value }
    if let value = areaReference { result["areaReference"] = value }
    if let value = absoluteXInches { result["absoluteXInches"] = value }
    if let value = absoluteYInches { result["absoluteYInches"] = value }
    if let value = distanceValue { result["distanceValue"] = value }
    if let value = distanceUnit { result["distanceUnit"] = value }
    if let value = direction { result["direction"] = value }
    if let value = clarificationText { result["clarificationText"] = value }
    if let value = areaMinXInches { result["areaMinXInches"] = value }
    if let value = areaMinYInches { result["areaMinYInches"] = value }
    if let value = areaMaxXInches { result["areaMaxXInches"] = value }
    if let value = areaMaxYInches { result["areaMaxYInches"] = value }
    return String(decoding: try JSONSerialization.data(withJSONObject: result), as: UTF8.self)
  }
}

@available(iOS 26.0, *)
private actor RouteSessions {
  static let shared = RouteSessions()
  private var sessions: [String: LanguageModelSession] = [:]
  private var running: (id: String, token: UUID, task: Task<String, Error>)?

  func create(_ id: String, _ instructions: String) throws {
    guard availability() == "AVAILABLE" else { throw routeAIError(availability()) }
    guard instructions.count <= 1500, id.count <= 200 else { throw routeAIError("INVALID_REQUEST") }
    sessions.removeAll() // Only one active stage/route context; never retain an unbounded session map.
    sessions[id] = LanguageModelSession(model: SystemLanguageModel.default, instructions: instructions)
  }
  func reset(_ id: String) {
    if running?.id == id { running?.task.cancel() }
    sessions.removeValue(forKey: id)
  }
  func respond(_ id: String, _ payload: String, interpret: Bool) async throws -> String {
    guard availability() == "AVAILABLE" else { throw routeAIError(availability()) }
    guard payload.utf8.count <= 10000 else { throw routeAIError("CONTEXT_SIZE") }
    guard running == nil, let session = sessions[id] else { throw routeAIError("SESSION_UNAVAILABLE") }
    let token = UUID()
    let task = Task<String, Error> { try await self.generate(session, payload, interpret: interpret) }
    running = (id, token, task)
    defer { if running?.token == token { running = nil } }
    do {
      let response = try await task.value
      guard sessions[id] != nil, !task.isCancelled else { throw CancellationError() }
      return response
    } catch {
      sessions.removeValue(forKey: id)
      throw error
    }
  }
  private func generate(_ session: LanguageModelSession, _ payload: String, interpret: Bool) async throws -> String {
    try Task.checkCancellation()
    do {
      if interpret {
        let response = try await session.respond(to: "Interpret this request using CURRENT context. Extract references and units. Do not answer facts. Data: \(payload)", generating: RouteDecision.self)
        return try response.content.json()
      }
      let response = try await session.respond(to: "Write at most two short sentences using ONLY these CURRENT authoritative facts. Do not convert units or calculate. A proposed change has NOT happened. Data: \(payload)")
      return String(response.content.prefix(1200))
    } catch is CancellationError {
      throw routeAIError("REQUEST_CANCELLED")
    } catch LanguageModelSession.GenerationError.exceededContextWindowSize {
      throw routeAIError("CONTEXT_SIZE")
    } catch LanguageModelSession.GenerationError.unsupportedLanguageOrLocale {
      throw routeAIError("UNSUPPORTED_LANGUAGE")
    } catch LanguageModelSession.GenerationError.guardrailViolation {
      throw routeAIError("MODEL_REFUSAL")
    } catch LanguageModelSession.GenerationError.refusal {
      throw routeAIError("MODEL_REFUSAL")
    } catch {
      #if compiler(>=6.4)
      if #available(iOS 27.0, *), let failure = error as? LanguageModelError {
        switch failure {
        case .contextSizeExceeded:
          throw routeAIError("CONTEXT_SIZE")
        case .unsupportedLanguageOrLocale: throw routeAIError("UNSUPPORTED_LANGUAGE")
        case .guardrailViolation, .refusal: throw routeAIError("MODEL_REFUSAL")
        default: break
        }
      }
      #endif
      throw routeAIError("GENERATION_FAILED: \(error.localizedDescription)")
    }
  }
}

public final class RouteAIModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RouteAI")
    AsyncFunction("getAvailability") { () -> String in availability() }
    AsyncFunction("createSession") { (id: String, instructions: String) in
      guard #available(iOS 26.0, *) else { throw routeAIError("UNSUPPORTED_OS") }
      try await RouteSessions.shared.create(id, instructions)
    }
    AsyncFunction("interpret") { (id: String, payload: String) -> String in
      guard #available(iOS 26.0, *) else { throw routeAIError("UNSUPPORTED_OS") }
      return try await RouteSessions.shared.respond(id, payload, interpret: true)
    }
    AsyncFunction("format") { (id: String, payload: String) -> String in
      guard #available(iOS 26.0, *) else { throw routeAIError("UNSUPPORTED_OS") }
      return try await RouteSessions.shared.respond(id, payload, interpret: false)
    }
    AsyncFunction("cancelGeneration") { (id: String) in
      if #available(iOS 26.0, *) { await RouteSessions.shared.reset(id) }
    }
    AsyncFunction("resetSession") { (id: String) in
      if #available(iOS 26.0, *) { await RouteSessions.shared.reset(id) }
    }
  }
}
