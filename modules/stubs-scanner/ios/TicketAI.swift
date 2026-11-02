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
@Generable
struct AIStay {
  @Guide(description: "The name of the place to stay as the booking shows it, e.g. 'Home in Gili T' or 'Hotel Lisboa'. Empty if not shown.")
  var place: String
  @Guide(description: "The host's first name, e.g. from 'Hosted by Made'. Never the guest's own name. Empty if not shown.")
  var host: String
  @Guide(description: "Check-in day as YYYY-MM-DD. Empty if not shown.")
  var checkInDate: String
  @Guide(description: "Check-in time in 24-hour HH:mm, e.g. 15:00. Empty if not shown.")
  var checkInTime: String
  @Guide(description: "Check-out day as YYYY-MM-DD. Empty if not shown.")
  var checkOutDate: String
  @Guide(description: "Check-out time in 24-hour HH:mm. Empty if not shown.")
  var checkOutTime: String
  @Guide(description: "The street address of the place, as printed. Empty if not shown.")
  var address: String
  @Guide(description: "How the guest gets the keys or gets in, in a few words, e.g. 'Keys at reception' or 'Lockbox by the door'. Not payment, safety or cancellation notices. Empty if not shown.")
  var gettingIn: String
  @Guide(description: "The door, gate, key box or house code, exactly as printed. Empty if not shown.")
  var doorCode: String
  @Guide(description: "The Wi-Fi network name, exactly as printed. Empty if not shown.")
  var wifiName: String
  @Guide(description: "The Wi-Fi password, exactly as printed. Empty if not shown.")
  var wifiPassword: String
  @Guide(description: "The host's or property's phone number, as printed, e.g. from 'Call +62 813-3067-0784'. Empty if not shown.")
  var phone: String
  @Guide(description: "Directions for arriving, as short steps in order, e.g. 'From the harbour, turn left at the mosque.' At most 5. Empty if there are none.")
  var arrival: [String]
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
    for limit in [4000, 2000] {
      let session = LanguageModelSession(instructions: instructions)
      let prompt = "Today is \(today).\n\nTicket text:\n\(String(text.prefix(limit)))"
      do {
        let response = try await session.respond(
          to: prompt,
          generating: AITicket.self,
          // A cap on the answer's length, so it can't run on repeating itself.
          options: GenerationOptions(sampling: .greedy, maximumResponseTokens: 500)
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
        // Only a ticket too long for the model is worth a second, shorter try.
        if !lastError.lowercased().contains("context") { break }
      }
    }
    return ["error": lastError]
  }
}

@available(iOS 26.0, *)
extension TicketAI {
  static let stayInstructions = """
    You read booking confirmations and check-in instructions for places to stay: Airbnb, Booking.com, \
    hotels, and messages from hosts. The text was read from a screenshot or PDF; columns are separated by tabs. \
    Only report what is written. Never guess or invent a value: leave it empty instead. \
    Ignore phone status bar text, buttons, adverts and reviews.
    """

  /// Returns the AIStay fields as a dictionary, or { error } if it couldn't.
  static func readStay(text: String, today: String) async -> [String: Any] {
    guard case .available = SystemLanguageModel.default.availability else {
      return ["error": "unavailable"]
    }
    var lastError = "no answer"
    for limit in [4000, 2000] {
      let session = LanguageModelSession(instructions: stayInstructions)
      let prompt = "Today is \(today).\n\nBooking text:\n\(String(text.prefix(limit)))"
      do {
        let response = try await session.respond(
          to: prompt,
          generating: AIStay.self,
          options: GenerationOptions(sampling: .greedy, maximumResponseTokens: 700)
        )
        let s = response.content
        return [
          "place": s.place,
          "host": s.host,
          "checkInDate": s.checkInDate,
          "checkInTime": s.checkInTime,
          "checkOutDate": s.checkOutDate,
          "checkOutTime": s.checkOutTime,
          "address": s.address,
          "gettingIn": s.gettingIn,
          "doorCode": s.doorCode,
          "wifiName": s.wifiName,
          "wifiPassword": s.wifiPassword,
          "phone": s.phone,
          "arrival": s.arrival,
        ]
      } catch {
        lastError = String(describing: error)
        if !lastError.lowercased().contains("context") { break }
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

  static func readStay(text: String, today: String) async -> [String: Any] {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      return await TicketAI.readStay(text: text, today: today)
    }
    #endif
    return ["error": "unsupported"]
  }
}
