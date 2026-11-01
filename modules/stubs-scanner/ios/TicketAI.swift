import Foundation

#if canImport(FoundationModels)
import FoundationModels

/// Reads a ticket's text with Apple's on-device model (Apple Intelligence, iOS 26+).
/// Nothing leaves the phone. The app checks every answer against the ticket text before using it.

@available(iOS 26.0, *)
@Generable
enum AITicketKind {
  case flight, train, ferry, bus, car, stay, gig, event, activity, visa, medical, other
}

@available(iOS 26.0, *)
@Generable
struct AITicketDetail {
  @Guide(description: "One of: Seat, Row, Section, Block, Coach, Cabin, Gate, Entrance, Door, Platform, Terminal, Deck, Doors, Boarding, Flight, Ref, Passenger")
  var label: String
  @Guide(description: "The value exactly as printed on the ticket")
  var value: String
}

@available(iOS 26.0, *)
@Generable
struct AITicket {
  @Guide(description: "What the ticket is for")
  var kind: AITicketKind
  @Guide(description: "A short title: the event, show or attraction name, or for travel the route as 'From → To'. Under 40 characters. Empty if unclear.")
  var title: String
  @Guide(description: "The company, operator, airline or venue that issued the ticket, as printed. Empty if not shown.")
  var company: String
  @Guide(description: "The day of the event, departure or check-in, as YYYY-MM-DD. Not the booking, purchase or issue date. Empty if not shown.")
  var date: String
  @Guide(description: "The start, departure or check-in time in 24-hour HH:mm. Empty if not shown.")
  var time: String
  @Guide(description: "Useful facts printed on the ticket. Only include facts that are actually printed.")
  var details: [AITicketDetail]
}

@available(iOS 26.0, *)
enum TicketAI {
  /// available | notEnabled | notReady | notEligible | unavailable
  static func status() -> String {
    switch SystemLanguageModel.default.availability {
    case .available:
      return "available"
    case .unavailable(let reason):
      switch reason {
      case .deviceNotEligible: return "notEligible"
      case .appleIntelligenceNotEnabled: return "notEnabled"
      case .modelNotReady: return "notReady"
      default: return "unavailable"
      }
    default:
      return "unavailable"
    }
  }

  static let instructions = """
    You read tickets for travel, events, activities, visas and hotel stays. \
    The text was read from a screenshot or PDF; columns are separated by tabs. \
    Only report what is printed on the ticket. Never guess or invent a value: leave it empty instead. \
    Ignore phone status bar text, adverts, terms and conditions.
    """

  /// Returns { kind, title, company, date, time, details: [{ label, value }] }, or { error } if it couldn't.
  static func read(text: String, today: String) async -> [String: Any] {
    guard case .available = SystemLanguageModel.default.availability else {
      return ["error": "unavailable"]
    }
    // The model's context is small: try most of the ticket first, then just the top of it.
    var lastError = "no answer"
    for limit in [5000, 2500] {
      let session = LanguageModelSession(instructions: instructions)
      let prompt = "Today is \(today).\n\nTicket text:\n\(String(text.prefix(limit)))"
      do {
        let response = try await session.respond(
          to: prompt,
          generating: AITicket.self,
          options: GenerationOptions(sampling: .greedy)
        )
        let t = response.content
        return [
          "kind": String(describing: t.kind),
          "title": t.title,
          "company": t.company,
          "date": t.date,
          "time": t.time,
          "details": t.details.map { ["label": $0.label, "value": $0.value] },
        ]
      } catch {
        lastError = String(describing: error)
      }
    }
    return ["error": lastError]
  }
}
#endif

/// Entry points that compile on every Xcode and iOS version.
enum TicketAIBridge {
  static func status() -> String {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      return TicketAI.status()
    }
    #endif
    return "unsupported"
  }

  static func read(text: String, today: String) async -> [String: Any] {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      return await TicketAI.read(text: text, today: today)
    }
    #endif
    return ["error": "unsupported"]
  }
}
