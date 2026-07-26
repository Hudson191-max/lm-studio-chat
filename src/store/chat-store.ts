import { create } from 'zustand'

export interface AttachedFile {
  name: string
  ext: string
  chars: number
  truncated?: boolean
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  thinking?: string
  images?: string[]
  files?: AttachedFile[]
  toolCalls?: unknown[]
  editedAt?: string
  createdAt?: string
}

export interface Conversation {
  id: string
  title: string
  systemPrompt?: string
  profileId?: string
  profile?: { id: string; name: string }
  createdAt: string
  updatedAt: string
  messages?: { id: string; role: string; content: string; thinking?: string; images?: string; toolCalls?: string; editedAt?: string; createdAt?: string }[]
}

export interface ModelProfile {
  id: string
  name: string
  url: string
  model: string
  temperature: number
  maxTokens: number
  isDefault: boolean
}

export interface McpTool {
  name: string
  description?: string
  inputSchema?: unknown
}

export interface McpServer {
  id: string
  name: string
  url: string
  enabled: boolean
  tools: McpTool[]
}

interface ChatState {
  // Conversations
  conversations: Conversation[]
  activeConversationId: string | null
  isLoadingConversations: boolean

  // Messages
  messages: Message[]
  streamingContent: string
  streamingThinking: string
  isStreaming: boolean
  streamingToolCalls: unknown[]

  // Connection
  isConnected: boolean
  availableModels: string[]
  modelContextLengths: Record<string, number>  // modelId → context window size
  selectedModel: string
  connectionError: string | null

  // Token usage (from last LM Studio response)
  lastTokenUsage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  } | null

  // Per-user daily quota (fetched from /api/usage)
  userQuota: {
    exempt: boolean
    hasLimits: boolean
    limits: { dailyMessageLimit: number | null; dailyTokenLimit: number | null }
    current: { messages: number; promptTokens: number; completionTokens: number; totalTokens: number }
  } | null

  // Tool call entries for the current streaming round — rendered as
  // collapsible ToolCallBlock components below the streaming message.
  // Cleared when a new message starts streaming or conversation switches.
  toolCallEntries: Array<{
    id?: string
    name: string
    args?: Record<string, unknown>
    content?: string
    isError?: boolean
    isExecuting?: boolean
    timestamp: number
  }>

  // UI
  sidebarOpen: boolean
  settingsOpen: boolean
  searchOpen: boolean
  profilesOpen: boolean
  mcpOpen: boolean
  changePasswordOpen: boolean

  // Profiles
  profiles: ModelProfile[]

  // MCP
  mcpServers: McpServer[]
  availableTools: McpTool[]

  // System prompt for current conversation
  currentSystemPrompt: string

  // Actions - Conversations
  setConversations: (conversations: Conversation[]) => void
  setActiveConversation: (id: string | null) => void
  addConversation: (conversation: Conversation) => void
  removeConversation: (id: string) => void
  updateConversationTitle: (id: string, title: string) => void
  setIsLoadingConversations: (loading: boolean) => void

  // Actions - Messages
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  updateMessage: (id: string, updates: Partial<Message>) => void
  removeMessagesFrom: (index: number) => void
  setStreamingContent: (content: string) => void
  appendStreamingContent: (content: string) => void
  setStreamingThinking: (content: string) => void
  appendStreamingThinking: (content: string) => void
  setIsStreaming: (streaming: boolean) => void
  clearCurrentChat: () => void

  // Actions - Connection
  setConnected: (connected: boolean) => void
  setAvailableModels: (models: string[]) => void
  setModelContextLengths: (lengths: Record<string, number>) => void
  setSelectedModel: (model: string) => void
  setConnectionError: (error: string | null) => void

  // Actions - Token usage
  setLastTokenUsage: (usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null) => void

  // Actions - User quota
  setUserQuota: (quota: {
    exempt: boolean
    hasLimits: boolean
    limits: { dailyMessageLimit: number | null; dailyTokenLimit: number | null }
    current: { messages: number; promptTokens: number; completionTokens: number; totalTokens: number }
  } | null) => void

  // Actions - Tool call entries
  setToolCallEntries: (entries: Array<{ id?: string; name: string; args?: Record<string, unknown>; content?: string; isError?: boolean; isExecuting?: boolean; timestamp: number }>) => void
  addToolCallEntry: (entry: { id?: string; name: string; args?: Record<string, unknown>; content?: string; isError?: boolean; isExecuting?: boolean; timestamp: number }) => void
  updateToolCallEntry: (name: string, updates: { content?: string; isError?: boolean; isExecuting?: boolean }) => void

  // Actions - UI
  setSidebarOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
  setProfilesOpen: (open: boolean) => void
  setMcpOpen: (open: boolean) => void
  setChangePasswordOpen: (open: boolean) => void

  // Actions - Profiles
  setProfiles: (profiles: ModelProfile[]) => void

  // Actions - MCP
  setMcpServers: (servers: McpServer[]) => void
  setAvailableTools: (tools: McpTool[]) => void

  // Actions - System prompt
  setCurrentSystemPrompt: (prompt: string) => void

  // Actions - Streaming tool calls
  setStreamingToolCalls: (calls: unknown[]) => void
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConversationId: null,
  isLoadingConversations: false,

  messages: [],
  streamingContent: '',
  streamingThinking: '',
  isStreaming: false,
  streamingToolCalls: [],

  isConnected: false,
  availableModels: [],
  modelContextLengths: {},
  selectedModel: '',
  connectionError: null,
  lastTokenUsage: null,
  userQuota: null,
  toolCallEntries: [],

  sidebarOpen: true,
  settingsOpen: false,
  searchOpen: false,
  profilesOpen: false,
  mcpOpen: false,
  changePasswordOpen: false,

  profiles: [],
  mcpServers: [],
  availableTools: [],
  currentSystemPrompt: '',

  setConversations: (conversations) => set({ conversations }),
  setActiveConversation: (id) => set({ activeConversationId: id }),
  addConversation: (conversation) =>
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      activeConversationId: conversation.id,
      messages: [],
      streamingContent: '',
      streamingThinking: '',
      currentSystemPrompt: conversation.systemPrompt || '',
    })),
  removeConversation: (id) =>
    set((state) => {
      const filtered = state.conversations.filter((c) => c.id !== id)
      const newActiveId =
        state.activeConversationId === id ? filtered[0]?.id ?? null : state.activeConversationId
      return {
        conversations: filtered,
        activeConversationId: newActiveId,
        messages: newActiveId === null || newActiveId !== state.activeConversationId ? state.messages : [],
      }
    }),
  updateConversationTitle: (id, title) =>
    set((state) => ({
      conversations: state.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
    })),
  setIsLoadingConversations: (loading) => set({ isLoadingConversations: loading }),

  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),
  removeMessagesFrom: (index) =>
    set((state) => ({
      messages: state.messages.slice(0, index),
    })),
  setStreamingContent: (content) => set({ streamingContent: content }),
  appendStreamingContent: (content) =>
    set((state) => ({ streamingContent: state.streamingContent + content })),
  setStreamingThinking: (content) => set({ streamingThinking: content }),
  appendStreamingThinking: (content) =>
    set((state) => ({ streamingThinking: state.streamingThinking + content })),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  clearCurrentChat: () => set({ messages: [], streamingContent: '', streamingThinking: '', streamingToolCalls: [], toolCallEntries: [] }),

  setConnected: (connected) => set({ isConnected: connected }),
  setAvailableModels: (models) => set({ availableModels: models }),
  setModelContextLengths: (lengths) => set({ modelContextLengths: lengths }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  setConnectionError: (error) => set({ connectionError: error }),
  setLastTokenUsage: (usage) => set({ lastTokenUsage: usage }),
  setUserQuota: (quota) => set({ userQuota: quota }),
  setToolCallEntries: (entries) => set({ toolCallEntries: entries }),
  addToolCallEntry: (entry) => set((state) => ({ toolCallEntries: [...state.toolCallEntries, entry] })),
  updateToolCallEntry: (name, updates) => set((state) => ({
    toolCallEntries: state.toolCallEntries.map((e, i) =>
      i === state.toolCallEntries.length - 1 && e.name === name && e.isExecuting
        ? { ...e, ...updates }
        : e
    ),
  })),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setProfilesOpen: (open) => set({ profilesOpen: open }),
  setMcpOpen: (open) => set({ mcpOpen: open }),
  setChangePasswordOpen: (open) => set({ changePasswordOpen: open }),

  setProfiles: (profiles) => set({ profiles }),
  setMcpServers: (servers) => set({ mcpServers: servers }),
  setAvailableTools: (tools) => set({ availableTools: tools }),
  setCurrentSystemPrompt: (prompt) => set({ currentSystemPrompt: prompt }),
  setStreamingToolCalls: (calls) => set({ streamingToolCalls: calls }),
}))