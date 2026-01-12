import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

export default async function (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Events handler reached - v5 minimal");

  return {
    status: 200,
    jsonBody: {
      ok: true,
      method: request.method,
      message: "Events endpoint responding"
    }
  };
}
