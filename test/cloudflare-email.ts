export class EmailMessage {
  readonly from: string;
  readonly to: string;
  readonly raw: ReadableStream<Uint8Array> | string;

  constructor(
    from: string,
    to: string,
    raw: ReadableStream<Uint8Array> | string,
  ) {
    this.from = from;
    this.to = to;
    this.raw = raw;
  }
}
