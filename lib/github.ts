import AsyncStorage from '@react-native-async-storage/async-storage';

export const PINNED_REPOS = [
  'hhdeunj1/2026',
  'hkmc-airlab/shucle-taxidriver-product',
  'hkmc-airlab/shucle-DriverVehicle-product',
  'hkmc-airlab/shucle-rider',
];

const TOKEN_KEY = 'github_token';
const DEFAULT_TOKEN = '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';

export async function getToken(): Promise<string | null> {
  const stored = await AsyncStorage.getItem(TOKEN_KEY);
  return stored || DEFAULT_TOKEN;
}

export async function saveToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token.trim());
}

export async function fetchAllRepos(): Promise<string[]> {
  const token = await getToken();
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    let repos: string[] = [];

    if (token) {
      // 토큰 있으면 인증된 유저의 모든 레포 (private 포함, org 포함) 한 번에
      let page = 1;
      while (true) {
        const res = await fetch(
          `https://api.github.com/user/repos?type=all&per_page=100&sort=updated&page=${page}`,
          { headers }
        );
        if (!res.ok) break;
        const data: any[] = await res.json();
        if (data.length === 0) break;
        repos.push(...data.filter((r) => !r.archived).map((r) => r.full_name as string));
        if (data.length < 100) break;
        page++;
      }
    } else {
      // 토큰 없으면 공개 레포만
      const [userRes, orgRes] = await Promise.all([
        fetch('https://api.github.com/users/hhdeunj1/repos?per_page=100&sort=updated', { headers }),
        fetch('https://api.github.com/orgs/hkmc-airlab/repos?per_page=100&sort=updated', { headers }),
      ]);
      const userRepos: any[] = userRes.ok ? await userRes.json() : [];
      const orgRepos: any[] = orgRes.ok ? await orgRes.json() : [];
      repos = [...userRepos, ...orgRepos]
        .filter((r) => !r.archived)
        .map((r) => r.full_name as string);
    }

    // 핀된 레포 상단 고정, 중복 제거
    const unique = Array.from(new Set(repos));
    const pinned = PINNED_REPOS.filter((r) => unique.includes(r) || true); // 항상 포함
    const rest = unique.filter((r) => !PINNED_REPOS.includes(r));
    return [...pinned, ...rest];
  } catch {
    return PINNED_REPOS;
  }
}

export function issueUrl(repo: string, issue: number): string {
  return `https://github.com/${repo}/issues/${issue}`;
}

export type GitHubIssue = { number: number; title: string; state: string; created_at: string };

export async function fetchRepoIssues(repo: string, page = 1): Promise<GitHubIssue[]> {
  const token = await getToken();
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const [owner, repoName] = repo.split('/');
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repoName}/issues?state=open&per_page=30&page=${page}&sort=created&direction=desc`,
    { headers }
  );
  if (!res.ok) throw new Error(`GitHub API 오류: ${res.status}`);
  const data: any[] = await res.json();
  return data.filter((i) => !i.pull_request).map((i) => ({ number: i.number, title: i.title, state: i.state, created_at: i.created_at as string }));
}

export async function createIssue(repo: string, title: string, body: string): Promise<number> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const [owner, repoName] = repo.split('/');
  const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/issues`, {
    method: 'POST', headers,
    body: JSON.stringify({ title, body }),
  });
  if (!res.ok) throw new Error(`GitHub API 오류: ${res.status}`);
  const data = await res.json();
  return data.number as number;
}
