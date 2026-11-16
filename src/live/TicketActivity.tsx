import { Divider, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  background,
  cornerRadius,
  kerning,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  padding,
  resizable,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type TicketActivityProps = {
  /** "Nidri → Kefalonia" */
  title: string;
  /** "FERRY · 2 TICKETS" */
  label: string;
  /** "09:30" or "Today" */
  when: string;
  /** "Seat 14 · Gate C" (may be empty) */
  detail: string;
  /** file:// URL of the code image in the shared app group folder (may be empty) */
  code: string;
  /** file:// URL of the Stash app icon in the shared folder ('' if missing: a drawn S stands in). */
  logo: string;
  /** The ticket type: flights get their own card. */
  kind: string;
  /** Flights only (empty otherwise): "Air New Zealand", "NZ 104", "SYD", "AKL", "13:55", "51", "23A", "I". */
  company: string;
  flightNo: string;
  from: string;
  to: string;
  boarding: string;
  gate: string;
  seat: string;
  terminal: string;
  /** When boarding starts, in milliseconds since 1970 (0 if unknown). */
  boardsAt: number;
};

// Runs inside the Live Activity's own runtime: only Expo UI components, no outside references.
const TicketActivity = (props: TicketActivityProps, env: LiveActivityEnvironment) => {
  'widget';
  // The logo violet, a little lighter so it reads on the black card.
  const violet = '#B07CFF';
  const paper = env.isLuminanceReduced ? '#BBBBB5' : '#F4F4F0';
  const soft = '#B9B9B2';
  const hasCode = props.code.length > 0;

  if (props.kind === 'flight') {
    // The flight card: white, the airline and flight number, the route, then boarding, gate, seat, terminal.
    const ink = '#111111';
    const grey = '#6B6B70';
    const blue = '#1E7BFF';
    const logo = '#9747FF';
    const facts = [
      ['BOARDING', props.boarding],
      ['GATE', props.gate],
      ['SEAT', props.seat],
      ['TERMINAL', props.terminal],
    ].filter((f) => f[1].length > 0);
    const route = props.from.length > 0 && props.to.length > 0;
    const soon = props.boardsAt > Date.now();
    const dashes = '- - - - - - - - - - - - - - -';
    return {
      banner: (
        <VStack
          alignment="leading"
          spacing={6}
          modifiers={[
            padding({ horizontal: 16, vertical: 12 }),
            frame({ maxWidth: 1000, alignment: 'leading' }),
            background('#FFFFFF'),
            activityBackgroundTint('#FFFFFF'),
          ]}
        >
          <HStack spacing={10}>
            {props.logo.length > 0 ? (
              <Image uiImage={props.logo} modifiers={[resizable(), frame({ width: 36, height: 36 }), cornerRadius(9)]} />
            ) : (
            <VStack
              spacing={0}
              modifiers={[frame({ width: 36, height: 36 }), background(logo, shapes.roundedRectangle({ cornerRadius: 9 }))]}
            >
              <Text modifiers={[font({ size: 18, weight: 'heavy' }), foregroundStyle('#FFFFFF')]}>S</Text>
              <HStack spacing={2}>
                <Text modifiers={[font({ size: 5 }), foregroundStyle('#FF2D95')]}>●</Text>
                <Text modifiers={[font({ size: 5 }), foregroundStyle('#1E7BFF')]}>●</Text>
                <Text modifiers={[font({ size: 5 }), foregroundStyle('#00D16C')]}>●</Text>
              </HStack>
            </VStack>
            )}
            <VStack alignment="leading" spacing={0}>
              <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(ink), lineLimit(1)]}>
                {props.company.length > 0 ? props.company : 'Your flight'}
              </Text>
              <Text modifiers={[font({ size: 13 }), foregroundStyle(grey), lineLimit(1)]}>
                {props.flightNo.length > 0 ? `Flight ${props.flightNo}` : props.title}
              </Text>
            </VStack>
            <Spacer />
            <HStack spacing={4} modifiers={[padding({ horizontal: 10, vertical: 5 }), background('#E8F1FF', shapes.capsule())]}>
              {/* Live countdown. iOS shows minutes and seconds under an hour; minutes only needs a native change (next build). */}
              {soon ? <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(blue)]}>Boards in</Text> : null}
              {soon ? (
                <Text
                  date={new Date(props.boardsAt)}
                  dateStyle="relative"
                  modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(blue), lineLimit(1)]}
                />
              ) : (
                <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(blue), lineLimit(1)]}>
                  {props.boarding.length > 0 ? `Boarding ${props.boarding}` : props.when}
                </Text>
              )}
            </HStack>
          </HStack>
          {route ? (
            <HStack spacing={8}>
              <Text modifiers={[font({ size: 26, weight: 'heavy' }), foregroundStyle(ink)]}>{props.from}</Text>
              <Text modifiers={[font({ size: 12 }), foregroundStyle('#C7C7CC'), lineLimit(1), minimumScaleFactor(0.3)]}>{dashes}</Text>
              <Image systemName="airplane" size={18} color={blue} />
              <Text modifiers={[font({ size: 12 }), foregroundStyle('#C7C7CC'), lineLimit(1), minimumScaleFactor(0.3)]}>{dashes}</Text>
              <Text modifiers={[font({ size: 26, weight: 'heavy' }), foregroundStyle(ink)]}>{props.to}</Text>
            </HStack>
          ) : (
            <Text modifiers={[font({ size: 22, weight: 'heavy' }), foregroundStyle(ink), lineLimit(1), minimumScaleFactor(0.6)]}>{props.title}</Text>
          )}
          {facts.length > 0 ? (
            <HStack spacing={0} modifiers={[padding({ vertical: 7 }), background('#F2F2F4', shapes.roundedRectangle({ cornerRadius: 14 }))]}>
              {facts.map((f, i) => (
                <HStack key={f[0]} spacing={0}>
                  {i > 0 ? <Divider modifiers={[frame({ height: 28 })]} /> : null}
                  <VStack spacing={1} modifiers={[frame({ maxWidth: 1000 })]}>
                    <Text modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle(grey), kerning(0.8)]}>{f[0]}</Text>
                    <Text modifiers={[font({ size: 18, weight: 'heavy' }), foregroundStyle(ink), lineLimit(1), minimumScaleFactor(0.6)]}>
                      {f[1]}
                    </Text>
                  </VStack>
                </HStack>
              ))}
            </HStack>
          ) : null}
        </VStack>
      ),
      // The Dynamic Island: the Stash icon and flight number, then gate and boarding time, in white.
      compactLeading: (
        <HStack spacing={4}>
          {props.logo.length > 0 ? (
            <Image uiImage={props.logo} modifiers={[resizable(), frame({ width: 18, height: 18 }), cornerRadius(5)]} />
          ) : (
            <Text
              modifiers={[
                font({ size: 12, weight: 'heavy' }),
                foregroundStyle('#FFFFFF'),
                frame({ width: 20, height: 20 }),
                background(logo, shapes.roundedRectangle({ cornerRadius: 5 })),
              ]}
            >
              S
            </Text>
          )}
          {props.flightNo.length > 0 ? (
            <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle('#FFFFFF'), lineLimit(1)]}>{props.flightNo}</Text>
          ) : null}
        </HStack>
      ),
      // Gate stacked over the time, so this side is no wider than the flight number and the island stays narrow.
      compactTrailing: (
        <VStack alignment="trailing" spacing={0}>
          {props.gate.length > 0 ? (
            <Text modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle('#FFFFFF'), lineLimit(1)]}>{`Gate ${props.gate}`}</Text>
          ) : null}
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle('#FFFFFF'), lineLimit(1)]}>
            {props.boarding.length > 0 ? props.boarding : props.when}
          </Text>
        </VStack>
      ),
      minimal:
        props.logo.length > 0 ? (
          <Image uiImage={props.logo} modifiers={[resizable(), frame({ width: 20, height: 20 }), cornerRadius(5)]} />
        ) : (
          <Text
            modifiers={[
              font({ size: 12, weight: 'heavy' }),
              foregroundStyle('#FFFFFF'),
              frame({ width: 20, height: 20 }),
              background(logo, shapes.roundedRectangle({ cornerRadius: 5 })),
            ]}
          >
            S
          </Text>
        ),
      expandedLeading: (
        <Text modifiers={[font({ size: 17, weight: 'heavy' }), foregroundStyle('#F4F4F0'), padding({ leading: 8 })]}>
          {route ? `${props.from} → ${props.to}` : props.flightNo}
        </Text>
      ),
      expandedTrailing: (
        <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle('#7DB3FF'), padding({ trailing: 8 })]}>
          {props.gate.length > 0 ? `Gate ${props.gate}` : props.when}
        </Text>
      ),
      expandedBottom: (
        <Text modifiers={[font({ size: 14 }), foregroundStyle('#B9B9B2'), lineLimit(1), padding({ horizontal: 8, bottom: 8 })]}>
          {facts.map((f) => `${f[0].charAt(0)}${f[0].slice(1).toLowerCase()} ${f[1]}`).join(' · ')}
        </Text>
      ),
    };
  }

  return {
    banner: (
      <HStack modifiers={[padding({ all: 16 }), activityBackgroundTint('#111111')]} spacing={14}>
        <VStack alignment="leading" spacing={4}>
          <Text modifiers={[font({ size: 11, weight: 'bold', design: 'monospaced' }), foregroundStyle(violet)]}>
            {props.label}
          </Text>
          <Text modifiers={[font({ size: 21, weight: 'heavy' }), foregroundStyle(paper), lineLimit(2)]}>
            {props.title}
          </Text>
          <Text modifiers={[font({ size: 13, design: 'monospaced' }), foregroundStyle(soft), lineLimit(1)]}>
            {props.detail.length > 0 ? `${props.when} · ${props.detail}` : props.when}
          </Text>
        </VStack>
        <Spacer />
        {hasCode ? (
          <Image
            uiImage={props.code}
            modifiers={[resizable(), frame({ width: 92, height: 92 }), padding({ all: 6 }), cornerRadius(10)]}
          />
        ) : (
          <Image systemName="ticket.fill" size={30} color={violet} />
        )}
      </HStack>
    ),
    compactLeading: <Image systemName="ticket.fill" color={violet} />,
    compactTrailing: <Text modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle(violet)]}>{props.when}</Text>,
    minimal: <Image systemName="ticket.fill" color={violet} />,
    expandedLeading: (
      <VStack alignment="leading" modifiers={[padding({ leading: 8 })]}>
        <Text modifiers={[font({ size: 11, weight: 'bold', design: 'monospaced' }), foregroundStyle(violet)]}>
          {props.label}
        </Text>
      </VStack>
    ),
    expandedTrailing: (
      <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(paper), padding({ trailing: 8 })]}>
        {props.when}
      </Text>
    ),
    expandedBottom: (
      <HStack spacing={12} modifiers={[padding({ horizontal: 8, bottom: 8 })]}>
        <VStack alignment="leading" spacing={4}>
          <Text modifiers={[font({ size: 18, weight: 'heavy' }), foregroundStyle(paper), lineLimit(2)]}>{props.title}</Text>
          <Text modifiers={[font({ size: 13, design: 'monospaced' }), foregroundStyle(soft), lineLimit(1)]}>
            {props.detail.length > 0 ? props.detail : 'Tap to show your code'}
          </Text>
        </VStack>
        <Spacer />
        {hasCode ? (
          <Image uiImage={props.code} modifiers={[resizable(), frame({ width: 84, height: 84 }), cornerRadius(8)]} />
        ) : null}
      </HStack>
    ),
  };
};

export default createLiveActivity<TicketActivityProps>('TicketActivity', TicketActivity);
