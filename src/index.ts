import { Hono } from "hono";
import OpenAI from "openai";

const app = new Hono();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (c) => {
  return c.text("Hello Poesy!");
});

app.post("/generate", async (c) => {
  const response = await openai.responses.create({
    model: "gpt-5",
    input:
      "Write a short poem about a photo of a cafe with film grain cosy vibes.",
  });

  return c.json(response);
});

export default app;
