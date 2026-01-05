import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type SSEEvent, createSSEHeaders, createSSEWriter, formatSSEEvent } from './sse';

describe('SSE Utilities', () => {
  describe('formatSSEEvent', () => {
    it('should format simple string data event', () => {
      const event: SSEEvent = {
        data: 'Hello, world!',
      };

      const result = formatSSEEvent(event);

      expect(result).toBe('data: Hello, world!\n\n');
    });

    it('should format event with id', () => {
      const event: SSEEvent = {
        data: 'message',
        id: '123',
      };

      const result = formatSSEEvent(event);

      expect(result).toBe('id: 123\ndata: message\n\n');
    });

    it('should format event with event type', () => {
      const event: SSEEvent = {
        data: 'notification',
        event: 'notification',
      };

      const result = formatSSEEvent(event);

      expect(result).toBe('event: notification\ndata: notification\n\n');
    });

    it('should format event with retry interval', () => {
      const event: SSEEvent = {
        data: 'reconnect',
        retry: 3000,
      };

      const result = formatSSEEvent(event);

      expect(result).toBe('retry: 3000\ndata: reconnect\n\n');
    });

    it('should format complete event with all fields', () => {
      const event: SSEEvent = {
        data: { message: 'test' },
        event: 'message',
        id: 'msg_1',
        retry: 5000,
      };

      const result = formatSSEEvent(event);

      expect(result).toBe('id: msg_1\nevent: message\nretry: 5000\ndata: {"message":"test"}\n\n');
    });

    it('should serialize object data to JSON', () => {
      const event: SSEEvent = {
        data: { key: 'value', nested: { foo: 'bar' } },
      };

      const result = formatSSEEvent(event);

      expect(result).toBe('data: {"key":"value","nested":{"foo":"bar"}}\n\n');
    });

    it('should handle multi-line string data correctly', () => {
      const event: SSEEvent = {
        data: 'line1\nline2\nline3',
      };

      const result = formatSSEEvent(event);

      expect(result).toBe('data: line1\ndata: line2\ndata: line3\n\n');
    });

    it('should handle array data by JSON serialization', () => {
      const event: SSEEvent = {
        data: [1, 2, 3],
        event: 'array',
      };

      const result = formatSSEEvent(event);

      expect(result).toBe('event: array\ndata: [1,2,3]\n\n');
    });

    it('should handle empty string data', () => {
      const event: SSEEvent = {
        data: '',
      };

      const result = formatSSEEvent(event);

      expect(result).toBe('data: \n\n');
    });

    it('should handle null data by JSON serialization', () => {
      const event: SSEEvent = {
        data: null,
      };

      const result = formatSSEEvent(event);

      expect(result).toBe('data: null\n\n');
    });

    it('should handle number data by JSON serialization', () => {
      const event: SSEEvent = {
        data: 42,
      };

      const result = formatSSEEvent(event);

      expect(result).toBe('data: 42\n\n');
    });

    it('should handle boolean data by JSON serialization', () => {
      const event: SSEEvent = {
        data: true,
      };

      const result = formatSSEEvent(event);

      expect(result).toBe('data: true\n\n');
    });

    it('should skip id field when undefined', () => {
      const event: SSEEvent = {
        data: 'test',
        id: undefined,
      };

      const result = formatSSEEvent(event);

      expect(result).not.toContain('id:');
      expect(result).toBe('data: test\n\n');
    });

    it('should skip event field when undefined', () => {
      const event: SSEEvent = {
        data: 'test',
        event: undefined,
      };

      const result = formatSSEEvent(event);

      expect(result).not.toContain('event:');
      expect(result).toBe('data: test\n\n');
    });

    it('should skip retry field when undefined', () => {
      const event: SSEEvent = {
        data: 'test',
        retry: undefined,
      };

      const result = formatSSEEvent(event);

      expect(result).not.toContain('retry:');
      expect(result).toBe('data: test\n\n');
    });

    it('should always end with double newline', () => {
      const event: SSEEvent = {
        data: 'test',
      };

      const result = formatSSEEvent(event);

      expect(result.endsWith('\n\n')).toBe(true);
    });
  });

  describe('createSSEWriter', () => {
    let controller: ReadableStreamDefaultController<string>;
    let enqueuedData: string[];

    beforeEach(() => {
      enqueuedData = [];
      controller = {
        enqueue: vi.fn((data: string) => enqueuedData.push(data)),
      } as any;
    });

    describe('writeEvent', () => {
      it('should enqueue formatted SSE event', () => {
        const writer = createSSEWriter(controller);
        const event: SSEEvent = {
          data: { message: 'hello' },
          event: 'greeting',
        };

        writer.writeEvent(event);

        expect(controller.enqueue).toHaveBeenCalledWith(
          'event: greeting\ndata: {"message":"hello"}\n\n',
        );
        expect(enqueuedData).toHaveLength(1);
      });

      it('should handle multiple events sequentially', () => {
        const writer = createSSEWriter(controller);

        writer.writeEvent({ data: 'event1' });
        writer.writeEvent({ data: 'event2' });
        writer.writeEvent({ data: 'event3' });

        expect(controller.enqueue).toHaveBeenCalledTimes(3);
        expect(enqueuedData).toHaveLength(3);
      });
    });

    describe('writeConnection', () => {
      it('should write connection event with default timestamp', () => {
        const writer = createSSEWriter(controller);
        const now = Date.now();

        writer.writeConnection('op_123', 'last_456');

        expect(controller.enqueue).toHaveBeenCalledOnce();
        const enqueuedEvent = enqueuedData[0];

        expect(enqueuedEvent).toContain('event: connected');
        expect(enqueuedEvent).toContain('id: conn_');
        expect(enqueuedEvent).toContain('"type":"connected"');
        expect(enqueuedEvent).toContain('"operationId":"op_123"');
        expect(enqueuedEvent).toContain('"lastEventId":"last_456"');
        expect(enqueuedEvent).toContain('"timestamp":');
      });

      it('should write connection event with custom timestamp', () => {
        const writer = createSSEWriter(controller);
        const customTimestamp = 1_700_000_000_000;

        writer.writeConnection('op_123', 'last_456', customTimestamp);

        const enqueuedEvent = enqueuedData[0];

        expect(enqueuedEvent).toContain(`id: conn_${customTimestamp}`);
        expect(enqueuedEvent).toContain(`"timestamp":${customTimestamp}`);
      });

      it('should include all required connection data fields', () => {
        const writer = createSSEWriter(controller);

        writer.writeConnection('operation_id_123', 'event_456', 1_234_567_890);

        const enqueuedEvent = enqueuedData[0];

        expect(enqueuedEvent).toContain('"operationId":"operation_id_123"');
        expect(enqueuedEvent).toContain('"lastEventId":"event_456"');
        expect(enqueuedEvent).toContain('"timestamp":1234567890');
        expect(enqueuedEvent).toContain('"type":"connected"');
      });
    });

    describe('writeError', () => {
      it('should write error event with Error object', () => {
        const writer = createSSEWriter(controller);
        const error = new Error('Something went wrong');
        error.stack = 'Error: Something went wrong\n  at test.ts:1:1';

        writer.writeError(error, 'op_123', 'processing');

        const enqueuedEvent = enqueuedData[0];

        expect(enqueuedEvent).toContain('event: error');
        expect(enqueuedEvent).toContain('id: error_');
        expect(enqueuedEvent).toContain('"type":"error"');
        expect(enqueuedEvent).toContain('"operationId":"op_123"');
        expect(enqueuedEvent).toContain('"error":"Something went wrong"');
        expect(enqueuedEvent).toContain('"phase":"processing"');
        expect(enqueuedEvent).toContain('"stack":"Error: Something went wrong');
      });

      it('should write error event without phase (defaults to unknown)', () => {
        const writer = createSSEWriter(controller);
        const error = new Error('Error without phase');

        writer.writeError(error, 'op_456');

        const enqueuedEvent = enqueuedData[0];

        expect(enqueuedEvent).toContain('"phase":"unknown"');
      });

      it('should write error event with custom timestamp', () => {
        const writer = createSSEWriter(controller);
        const error = new Error('Test error');
        const customTimestamp = 1_600_000_000_000;

        writer.writeError(error, 'op_789', 'validation', customTimestamp);

        const enqueuedEvent = enqueuedData[0];

        expect(enqueuedEvent).toContain(`id: error_${customTimestamp}`);
        expect(enqueuedEvent).toContain(`"timestamp":${customTimestamp}`);
      });

      it('should handle non-Error objects by converting to string', () => {
        const writer = createSSEWriter(controller);
        const errorString = 'Plain string error';

        writer.writeError(errorString, 'op_123', 'unknown');

        const enqueuedEvent = enqueuedData[0];

        expect(enqueuedEvent).toContain('"error":"Plain string error"');
      });

      it('should not include stack when error has no stack property', () => {
        const writer = createSSEWriter(controller);
        const error = new Error('No stack');
        delete error.stack;

        writer.writeError(error, 'op_123');

        const enqueuedEvent = enqueuedData[0];

        expect(enqueuedEvent).not.toContain('"stack"');
      });

      it('should include all required error data fields', () => {
        const writer = createSSEWriter(controller);
        const error = new Error('Test error');

        writer.writeError(error, 'operation_id', 'phase_name', 9_999_999);

        const enqueuedEvent = enqueuedData[0];

        expect(enqueuedEvent).toContain('"operationId":"operation_id"');
        expect(enqueuedEvent).toContain('"timestamp":9999999');
        expect(enqueuedEvent).toContain('"type":"error"');
        expect(enqueuedEvent).toContain('"error":"Test error"');
        expect(enqueuedEvent).toContain('"phase":"phase_name"');
      });
    });

    describe('writeHeartbeat', () => {
      it('should write heartbeat event with default timestamp', () => {
        const writer = createSSEWriter(controller);

        writer.writeHeartbeat();

        const enqueuedEvent = enqueuedData[0];

        expect(enqueuedEvent).toContain('event: heartbeat');
        expect(enqueuedEvent).toContain('id: heartbeat_');
        expect(enqueuedEvent).toContain('"type":"heartbeat"');
        expect(enqueuedEvent).toContain('"timestamp":');
      });

      it('should write heartbeat event with custom timestamp', () => {
        const writer = createSSEWriter(controller);
        const customTimestamp = 1_500_000_000_000;

        writer.writeHeartbeat(customTimestamp);

        const enqueuedEvent = enqueuedData[0];

        expect(enqueuedEvent).toContain(`id: heartbeat_${customTimestamp}`);
        expect(enqueuedEvent).toContain(`"timestamp":${customTimestamp}`);
      });

      it('should only include type and timestamp in heartbeat data', () => {
        const writer = createSSEWriter(controller);

        writer.writeHeartbeat(1_234_567_890);

        const enqueuedEvent = enqueuedData[0];

        expect(enqueuedEvent).toContain('{"timestamp":1234567890,"type":"heartbeat"}');
      });
    });

    describe('writeStreamEvent', () => {
      it('should write stream event with event data', () => {
        const writer = createSSEWriter(controller);
        const eventData = {
          content: 'streaming data',
          type: 'stream_chunk',
        };

        writer.writeStreamEvent(eventData);

        const enqueuedEvent = enqueuedData[0];

        expect(enqueuedEvent).toContain('event: stream_chunk');
        expect(enqueuedEvent).toContain('id: event_');
        expect(enqueuedEvent).toContain('"content":"streaming data"');
        expect(enqueuedEvent).toContain('"type":"stream_chunk"');
      });

      it('should use custom event ID when provided', () => {
        const writer = createSSEWriter(controller);
        const eventData = { message: 'test' };

        writer.writeStreamEvent(eventData, 'custom_id_123');

        const enqueuedEvent = enqueuedData[0];

        expect(enqueuedEvent).toContain('id: custom_id_123');
      });

      it('should default to stream event type when type not in data', () => {
        const writer = createSSEWriter(controller);
        const eventData = { payload: 'some data' };

        writer.writeStreamEvent(eventData);

        const enqueuedEvent = enqueuedData[0];

        expect(enqueuedEvent).toContain('event: stream');
      });

      it('should use type from event data when available', () => {
        const writer = createSSEWriter(controller);
        const eventData = {
          data: 'test',
          type: 'custom_type',
        };

        writer.writeStreamEvent(eventData);

        const enqueuedEvent = enqueuedData[0];

        expect(enqueuedEvent).toContain('event: custom_type');
      });

      it('should generate timestamp-based ID when not provided', () => {
        const writer = createSSEWriter(controller);
        const eventData = { test: 'data' };
        const beforeTimestamp = Date.now();

        writer.writeStreamEvent(eventData);

        const enqueuedEvent = enqueuedData[0];
        const idMatch = enqueuedEvent.match(/id: event_(\d+)/);

        expect(idMatch).toBeTruthy();
        const timestamp = Number.parseInt(idMatch![1]!, 10);
        expect(timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
        expect(timestamp).toBeLessThanOrEqual(Date.now());
      });

      it('should handle complex nested event data', () => {
        const writer = createSSEWriter(controller);
        const eventData = {
          metadata: {
            nested: {
              deep: 'value',
            },
          },
          type: 'complex',
        };

        writer.writeStreamEvent(eventData, 'complex_1');

        const enqueuedEvent = enqueuedData[0];

        expect(enqueuedEvent).toContain('"metadata":{"nested":{"deep":"value"}}');
      });
    });

    it('should allow chaining multiple write calls', () => {
      const writer = createSSEWriter(controller);

      writer.writeConnection('op_1', 'event_1');
      writer.writeHeartbeat();
      writer.writeStreamEvent({ data: 'test' });
      writer.writeError(new Error('test'), 'op_1');

      expect(controller.enqueue).toHaveBeenCalledTimes(4);
      expect(enqueuedData).toHaveLength(4);
    });
  });

  describe('createSSEHeaders', () => {
    it('should return correct SSE headers', () => {
      const headers = createSSEHeaders();

      expect(headers).toEqual({
        'Access-Control-Allow-Headers': 'Cache-Control, Last-Event-ID',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Content-Type': 'text/event-stream',
        'X-Accel-Buffering': 'no',
      });
    });

    it('should include CORS headers for cross-origin streaming', () => {
      const headers = createSSEHeaders() as any;

      expect(headers['Access-Control-Allow-Origin']).toBe('*');
      expect(headers['Access-Control-Allow-Methods']).toBe('GET');
      expect(headers['Access-Control-Allow-Headers']).toBe('Cache-Control, Last-Event-ID');
    });

    it('should disable caching with Cache-Control header', () => {
      const headers = createSSEHeaders() as any;

      expect(headers['Cache-Control']).toBe('no-cache, no-transform');
    });

    it('should set correct Content-Type for SSE', () => {
      const headers = createSSEHeaders() as any;

      expect(headers['Content-Type']).toBe('text/event-stream');
    });

    it('should keep connection alive', () => {
      const headers = createSSEHeaders() as any;

      expect(headers['Connection']).toBe('keep-alive');
    });

    it('should disable nginx buffering', () => {
      const headers = createSSEHeaders() as any;

      expect(headers['X-Accel-Buffering']).toBe('no');
    });

    it('should return a new object each time', () => {
      const headers1 = createSSEHeaders();
      const headers2 = createSSEHeaders();

      expect(headers1).not.toBe(headers2);
      expect(headers1).toEqual(headers2);
    });
  });
});
