type SseClient = {
  stream: ReadableStream<Uint8Array>;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  close: () => void;
};

function encode(data: string): Uint8Array {
  return new TextEncoder().encode(data);
}

function formatEvent(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export class EventStreamManager {
  private readonly channels = new Map<string, Set<SseClient>>();

  subscribe(sprintId: string): SseClient {
    const writerRef: { writer?: WritableStreamDefaultWriter<Uint8Array> } = {};

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const writable = new WritableStream<Uint8Array>({
          write(chunk) {
            controller.enqueue(chunk);
          },
        });

        writerRef.writer = writable.getWriter();
      },
      cancel() {
      },
    });

    const writer = writerRef.writer;
    if (!writer) {
      throw new Error('Failed to initialize SSE writer');
    }

    const client: SseClient = {
      stream,
      writer,
      close: () => {
        const channel = this.channels.get(sprintId);
        channel?.delete(client);
        void writer.close();
      },
    };

    const channel = this.channels.get(sprintId) ?? new Set<SseClient>();
    channel.add(client);
    this.channels.set(sprintId, channel);

    return client;
  }

  async publish(sprintId: string, event: string, payload: unknown): Promise<void> {
    const channel = this.channels.get(sprintId);
    if (!channel || channel.size === 0) {
      return;
    }

    const message = encode(formatEvent(event, payload));
    const stale: SseClient[] = [];

    for (const client of channel) {
      try {
        await client.writer.write(message);
      } catch {
        stale.push(client);
      }
    }

    for (const client of stale) {
      client.close();
    }
  }

  async heartbeat(): Promise<void> {
    const beat = encode(': heartbeat\n\n');
    for (const channel of this.channels.values()) {
      const stale: SseClient[] = [];
      for (const client of channel) {
        try {
          await client.writer.write(beat);
        } catch {
          stale.push(client);
        }
      }
      for (const client of stale) {
        client.close();
      }
    }
  }
}

export const eventStreamManager = new EventStreamManager();
