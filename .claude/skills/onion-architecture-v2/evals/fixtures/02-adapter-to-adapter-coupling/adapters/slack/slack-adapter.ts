export class SlackAdapter {
  async postMessage(channel: string, text: string): Promise<void> {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      body: JSON.stringify({ channel, text }),
    });
  }
}
