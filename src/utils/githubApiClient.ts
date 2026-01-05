import axios, { AxiosResponse } from 'axios';

export interface GitHubRepository {
    id: number;
    name: string;
    full_name: string;
    clone_url: string;
    html_url: string;
    description: string | null;
    private: boolean;
    fork: boolean;
    [key: string]: any; // Allow additional GitHub API fields
}

/**
 * Fetches GitHub repositories for a given username using OAuth authentication
 * Includes both public and private repositories that the authenticated user has access to
 * @param username GitHub username
 * @param accessToken OAuth access token
 * @param tokenType Token type (default: 'bearer')
 * @returns Array of GitHub repositories (both public and private)
 */
export async function fetchGitHubRepositories(
    username: string,
    accessToken: string,
    tokenType: string = 'bearer'
): Promise<GitHubRepository[]> {
    try {
        // First, get the authenticated user's info to check if username matches
        const headers: Record<string, string> = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'DevOps-Automate/1.0',
        };

        // Add authorization header
        if (tokenType.toLowerCase() === 'bearer') {
            headers['Authorization'] = `Bearer ${accessToken}`;
        } else {
            headers['Authorization'] = `token ${accessToken}`;
        }

        // Get authenticated user info to determine best endpoint
        let authenticatedUsername: string | null = null;
        try {
            const userResponse = await axios.get('https://api.github.com/user', { headers });
            authenticatedUsername = userResponse.data.login;
        } catch (error) {
            console.warn('[GitHub API] Could not fetch authenticated user info, proceeding with username endpoint');
        }

        // Use /user/repos endpoint if fetching for authenticated user (better for private repos)
        // Otherwise use /users/{username}/repos with type=all
        const url = authenticatedUsername && authenticatedUsername.toLowerCase() === username.toLowerCase()
            ? 'https://api.github.com/user/repos'
            : `https://api.github.com/users/${username}/repos`;

        const params: Record<string, any> = {
            per_page: 100, // Maximum per page
            sort: 'updated',
            direction: 'desc',
        };

        // Add appropriate parameters based on endpoint
        if (authenticatedUsername && authenticatedUsername.toLowerCase() === username.toLowerCase()) {
            // For authenticated user, use visibility=all to get all repos
            params.visibility = 'all';
        } else {
            // For other users, use type=all to get all repos the authenticated user can access
            params.type = 'all';
        }

        const response: AxiosResponse<GitHubRepository[]> = await axios.get(url, {
            headers: headers,
            params: params,
        });

        // Handle pagination if needed
        let allRepos = response.data;

        // Check if there are more pages
        const linkHeader = response.headers.link;
        if (linkHeader && linkHeader.includes('rel="next"')) {
            // Parse link header and fetch remaining pages
            // For simplicity, we'll fetch up to 3 pages (300 repos max)
            // You can implement full pagination if needed
            const pages = extractPagesFromLinkHeader(linkHeader);
            for (let page = 2; page <= Math.min(pages.total, 3); page++) {
                const pageParams = { ...params, page: page };
                const pageResponse: AxiosResponse<GitHubRepository[]> = await axios.get(url, {
                    headers: headers,
                    params: pageParams,
                });
                allRepos = allRepos.concat(pageResponse.data);
            }
        }

        return allRepos;
    } catch (error: any) {
        if (error.response) {
            // GitHub API error
            const status = error.response.status;
            const statusText = error.response.statusText;
            const message = error.response.data?.message || statusText;
            throw new Error(`GitHub API error: ${status} - ${message}`);
        } else if (error.request) {
            // Network error
            throw new Error('Network error: Could not reach GitHub API');
        } else {
            // Other error
            throw new Error(`Error fetching repositories: ${error.message}`);
        }
    }
}

export interface GitHubBranch {
    name: string;
    commit: {
        sha: string;
        url: string;
    };
    protected: boolean;
    [key: string]: any; // Allow additional GitHub API fields
}

/**
 * Fetches GitHub repository branches for a given owner/repo using OAuth authentication
 * @param owner GitHub repository owner (username or organization name)
 * @param repo GitHub repository name
 * @param accessToken OAuth access token
 * @param tokenType Token type (default: 'bearer')
 * @returns Array of GitHub branches
 */
export async function fetchGitHubBranches(
    owner: string,
    repo: string,
    accessToken: string,
    tokenType: string = 'bearer'
): Promise<GitHubBranch[]> {
    try {
        const url = `https://api.github.com/repos/${owner}/${repo}/branches`;

        const headers: Record<string, string> = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'DevOps-Automate/1.0',
        };

        // Add authorization header
        if (tokenType.toLowerCase() === 'bearer') {
            headers['Authorization'] = `Bearer ${accessToken}`;
        } else {
            headers['Authorization'] = `token ${accessToken}`;
        }

        const response: AxiosResponse<GitHubBranch[]> = await axios.get(url, {
            headers: headers,
            params: {
                per_page: 100, // Maximum per page
                sort: 'updated',
                direction: 'desc',
            },
        });

        // Handle pagination if needed
        let allBranches = response.data;

        // Check if there are more pages
        const linkHeader = response.headers.link;
        if (linkHeader && linkHeader.includes('rel="next"')) {
            // Parse link header and fetch remaining pages
            // For simplicity, we'll fetch up to 3 pages (300 branches max)
            const pages = extractPagesFromLinkHeader(linkHeader);
            for (let page = 2; page <= Math.min(pages.total, 3); page++) {
                const pageResponse: AxiosResponse<GitHubBranch[]> = await axios.get(url, {
                    headers: headers,
                    params: {
                        per_page: 100,
                        page: page,
                        sort: 'updated',
                        direction: 'desc',
                    },
                });
                allBranches = allBranches.concat(pageResponse.data);
            }
        }

        return allBranches;
    } catch (error: any) {
        if (error.response) {
            // GitHub API error
            const status = error.response.status;
            const statusText = error.response.statusText;
            const message = error.response.data?.message || statusText;
            throw new Error(`GitHub API error: ${status} - ${message}`);
        } else if (error.request) {
            // Network error
            throw new Error('Network error: Could not reach GitHub API');
        } else {
            // Other error
            throw new Error(`Error fetching branches: ${error.message}`);
        }
    }
}

/**
 * Extracts pagination information from GitHub API Link header
 */
function extractPagesFromLinkHeader(linkHeader: string): { total: number } {
    const links = linkHeader.split(',');
    let total = 1;

    links.forEach((link) => {
        const match = link.match(/page=(\d+)>; rel="last"/);
        if (match) {
            total = parseInt(match[1], 10);
        }
    });

    return { total };
}

