import {Octokit} from '@octokit/rest';
import {createNodeMiddleware} from '@octokit/webhooks';
import {App} from '@octokit/app';
import {createAppAuth} from '@octokit/auth-app';
import {request} from '@octokit/request';
import * as sshpk from 'sshpk';

interface GitHubConnectionConfig {
    type: 'http' | 'ssh';
    url: string;
    username?: string;
    token?: string;
    sshKey?: string;
    enableApi?: boolean;
}

export class GitHubConnectorService {
    async validateConnection(
        config: GitHubConnectionConfig,
    ): Promise<{success: boolean; error?: any}> {
        try {
            if (config.type === 'http') {
                return await this.validateHttpConnection(config);
            } else {
                return await this.validateSshConnection(config);
            }
        } catch (error: any) {
            console.error('GitHub connection validation failed:', error);
            return {
                success: false,
                error: {
                    title: 'Connection Failed',
                    message:
                        error.message || 'Failed to validate GitHub connection',
                    details: JSON.stringify(
                        {
                            errors: [
                                {
                                    reason: error.name || 'ConnectionError',
                                    message:
                                        error.message ||
                                        'Unknown error occurred',
                                    ...(error.response?.data && {
                                        response: error.response.data,
                                    }),
                                },
                            ],
                        },
                        null,
                        2,
                    ),
                },
            };
        }
    }

    private async validateHttpConnection(
        config: GitHubConnectionConfig,
    ): Promise<{success: boolean; error?: any}> {
        if (!config.username || !config.token) {
            throw new Error('Username and Personal Access Token are required');
        }

        try {
            // Create Octokit instance with the token
            const octokit = new Octokit({
                auth: config.token,
                baseUrl: 'https://api.github.com',
            });

            // Test authentication by getting the authenticated user
            const {data: user} = await octokit.users.getAuthenticated();

            // Verify username matches
            if (user.login.toLowerCase() !== config.username.toLowerCase()) {
                throw new Error(
                    'Username does not match the authenticated user',
                );
            }

            // If API access is enabled, test additional permissions
            if (config.enableApi) {
                // Test repository access
                const repoUrl = new URL(config.url);
                const [owner, repo] = repoUrl.pathname
                    .split('/')
                    .filter(Boolean);

                if (owner && repo) {
                    await octokit.repos.get({
                        owner,
                        repo: repo.replace('.git', ''),
                    });
                }

                // Test webhook permissions if needed
                await octokit.repos.listWebhooks({
                    owner: user.login,
                    repo: repo.replace('.git', ''),
                });
            }

            return {success: true};
        } catch (error: any) {
            if (error.response?.status === 401) {
                throw new Error('Invalid Personal Access Token');
            } else if (error.response?.status === 403) {
                throw new Error(
                    'Insufficient permissions. Please check token scopes.',
                );
            } else if (error.response?.status === 404) {
                throw new Error('Repository not found or no access');
            }
            throw error;
        }
    }

    private async validateSshConnection(
        config: GitHubConnectionConfig,
    ): Promise<{success: boolean; error?: any}> {
        if (!config.sshKey) {
            throw new Error('SSH Key is required');
        }

        try {
            // Validate SSH key format
            const key = sshpk.parsePrivateKey(config.sshKey, 'auto');
            if (!key.type.includes('private')) {
                throw new Error('Invalid SSH key: Must be a private key');
            }

            // TODO: Implement actual SSH connection test
            // This would typically involve:
            // 1. Creating a temporary SSH agent
            // 2. Adding the key to the agent
            // 3. Attempting to connect to GitHub via SSH
            // 4. Testing repository access if a specific repo is provided

            // For now, we'll just validate the key format
            return {success: true};
        } catch (error: any) {
            if (error.message.includes('Invalid SSH key')) {
                throw new Error(
                    'Invalid SSH key format. Please provide a valid private key.',
                );
            }
            throw error;
        }
    }
}
