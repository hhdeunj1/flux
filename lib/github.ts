import AsyncStorage from '@react-native-async-storage/async-storage';

export const PINNED_REPOS = [
  'hhdeunj1/2026',
  'hkmc-airlab/shucle-taxidriver-product',
  'hkmc-airlab/shucle-DriverVehicle-product',
  'hkmc-airlab/shucle-rider',
];

const TOKEN_KEY = 'github_token';
const DEFAULT_TOKEN = process.env.EXPO_PUBLIC_GH_TOKEN ?? '';

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

export const PRODUCT_REPO_MAP: Record<string, string> = {
  '라이더앱': 'hkmc-airlab/shucle-rider',
  '택시기사앱': 'hkmc-airlab/shucle-taxidriver-product',
  '드라이버앱': 'hkmc-airlab/shucle-DriverVehicle-product',
  '키오스크': 'hkmc-airlab/shucle-kiosk-product',
  '기준': 'hhdeunj1/2026',
};

export type GitHubIssueDetail = {
  number: number;
  title: string;
  state: string;
  repo: string;
  html_url: string;
  milestone_title: string | null;
  created_at: string;
  assignees: string[];
};

async function getHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export async function fetchMilestoneNumber(repo: string, milestoneTitle: string): Promise<number | null> {
  const headers = await getHeaders();
  const [owner, repoName] = repo.split('/');
  const normalized = milestoneTitle.replace(/^v/, '');
  // 페이지네이션으로 전체 마일스톤 탐색 (state=all, closed 포함)
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/milestones?state=all&per_page=100&page=${page}`,
      { headers }
    );
    if (!res.ok) return null;
    const data: any[] = await res.json();
    if (data.length === 0) break;
    const found = data.find((m) =>
      m.title === milestoneTitle ||
      m.title === normalized ||
      m.title === `v${normalized}`
    );
    if (found) return found.number;
    if (data.length < 100) break; // 마지막 페이지
  }
  return null;
}

export async function fetchIssuesByMilestone(repo: string, milestoneTitle: string): Promise<GitHubIssueDetail[]> {
  const headers = await getHeaders();
  const [owner, repoName] = repo.split('/');
  const milestoneNumber = await fetchMilestoneNumber(repo, milestoneTitle);
  if (milestoneNumber === null) return [];
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repoName}/issues?milestone=${milestoneNumber}&state=open&per_page=100`,
    { headers }
  );
  if (!res.ok) return [];
  const data: any[] = await res.json();
  return data
    .filter((i) => !i.pull_request)
    .map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      repo,
      html_url: i.html_url as string,
      milestone_title: i.milestone?.title ?? null,
      created_at: i.created_at as string,
      assignees: (i.assignees as any[]).map((a) => a.login as string),
    }));
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
