import { createOptimizerHost, type OptimizerRequest, type OptimizerResponse } from "@opencutplan/core";

const scope = self as unknown as { postMessage(message: OptimizerResponse): void; onmessage: ((event: MessageEvent<OptimizerRequest>) => void) | null };
const handle = createOptimizerHost((message) => scope.postMessage(message));
scope.onmessage = (event) => handle(event.data);
