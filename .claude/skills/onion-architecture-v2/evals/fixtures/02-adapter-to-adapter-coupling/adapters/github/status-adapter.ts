import { SlackAdapter } from '../slack/slack-adapter.js';

export class OctokitStatusAdapter {
  private slack = new SlackAdapter();

  constructor(private token: string) {}

  async setStatus(owner: string, repo: string, sha: string, state: string): Promise<void> {
    await fetch(`https://api.github.com/repos/${owner}/${repo}/statuses/${sha}`, {
      method: 'POST',
      headers: { authorization: `token ${this.token}` },
      body: JSON.stringify({ state }),
    });
    if (state === 'failure') {
      await this.slack.postMessage('#ci-alerts', `${owner}/${repo}@${sha} status: ${state}`);
    }
  }
}
