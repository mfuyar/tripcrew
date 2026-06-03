import { RealtimeChannel } from '@supabase/supabase-js';

type RestBroadcastChannel = RealtimeChannel & {
  httpSend?: (event: string, payload: unknown) => Promise<unknown>;
};

export async function sendBroadcast(
  channel: RealtimeChannel,
  event: string,
  payload: unknown
): Promise<void> {
  const restChannel = channel as RestBroadcastChannel;
  if (restChannel.httpSend) {
    await restChannel.httpSend(event, payload);
    return;
  }

  await channel.send({ type: 'broadcast', event, payload });
}
