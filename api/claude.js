module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { apiKey, ...rest } = req.body ?? {};

  if (!apiKey) {
    return res.status(400).json({ error: 'apiKey is required' });
  }

  try {
    const response = await fetch('https://h-chat-api.autoever.com/claude-code/v2/v1/messages', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiKey}`,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(rest),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
