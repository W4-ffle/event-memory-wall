import { HttpRequest } from "@azure/functions";

const httpTrigger = async function (
  context: any,
  req: any
): Promise<void> {
  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: {
      ok: true,
      service: "event-memory-wall-api",
      time: new Date().toISOString()
    }
  };
};

export default httpTrigger;