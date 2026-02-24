import type {
  AuthStateResponse,
  ModelListRequest,
  ModelListResponse,
  StartChatgptLoginResponse,
} from "@codex-app/shared-contracts";
import { JsonRpcClient } from "../rpc/jsonrpc-client";

export class AuthService {
  constructor(private readonly rpc: JsonRpcClient) {}

  async startChatgptLogin(): Promise<StartChatgptLoginResponse> {
    const result = await this.rpc.request<{ loginId: string; authUrl: string }>(
      "account/login/start",
      { type: "chatgpt" },
    );

    return {
      loginId: result.loginId,
      authUrl: result.authUrl,
    };
  }

  async cancelChatgptLogin(loginId: string): Promise<void> {
    await this.rpc.request("account/login/cancel", { loginId });
  }

  async readAuthState(): Promise<AuthStateResponse> {
    const result = await this.rpc.request<{ account: Record<string, unknown> | null }>("account/read", {
      refreshToken: false,
    });

    const account = result.account;
    const authMode = account?.type === "apiKey"
      ? "apikey"
      : account?.type === "chatgpt"
        ? "chatgpt"
        : account?.type === "chatgptAuthTokens"
          ? "chatgptAuthTokens"
          : null;

    return {
      authMode,
      account,
    };
  }

  async listModels(request: ModelListRequest): Promise<ModelListResponse> {
    const result = await this.rpc.request<ModelListResponse>("model/list", {
      limit: request.limit ?? 30,
      includeHidden: request.includeHidden ?? false,
    });

    return result;
  }
}
