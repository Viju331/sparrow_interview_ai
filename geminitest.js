const API_KEY = "API_KEY";

async function testGemini() {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: "Hello" }]
          }
        ]
      })
    }
  );

  const data = await res.json();
  console.log(data);
}

testGemini();