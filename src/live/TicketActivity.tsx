import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  cornerRadius,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  resizable,
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
};

// Runs inside the Live Activity's own runtime: only Expo UI components, no outside references.
const TicketActivity = (props: TicketActivityProps, env: LiveActivityEnvironment) => {
  'widget';
  // The logo violet, a little lighter so it reads on the black card.
  const violet = '#B07CFF';
  const paper = env.isLuminanceReduced ? '#BBBBB5' : '#F4F4F0';
  const soft = '#B9B9B2';
  const hasCode = props.code.length > 0;

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
