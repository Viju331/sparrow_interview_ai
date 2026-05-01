const GITHUB_TOKEN = "API_KEYs";

async function testGitHubModels() {
  try {
    const response = await fetch(
      "https://models.github.ai/inference/chat/completions",
      {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${GITHUB_TOKEN}`,
          "X-GitHub-Api-Version": "2026-03-10",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "openai/gpt-4.1",   // change to any available model
          messages: [
            { role: "user", content: "Hello from GitHub Models!" }
          ]
        })
      }
    );

    const data = await response.json();
    console.log("Status:", response.status);
    console.log("Response:", data);
  } catch (err) {
    console.error("Error calling GitHub Models API:", err);
  }
}

testGitHubModels();