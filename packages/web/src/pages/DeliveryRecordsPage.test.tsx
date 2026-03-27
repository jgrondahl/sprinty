import { describe, expect, it } from 'bun:test';
import { DeliveryRecordsPage } from './DeliveryRecordsPage';

describe('DeliveryRecordsPage', () => {
  it('exports a renderable component', () => {
    expect(typeof DeliveryRecordsPage).toBe('function');
  });
});
