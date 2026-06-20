/** @vitest-environment jsdom */
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AIChat from "@/components/chat/AIChat";
import { AEGIS_ITEM_SELECTED_EVENT, formatItemMention } from "@/lib/ai/item-mentions";
import "../setup-component";

vi.mock("react-markdown", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("remark-gfm", () => ({
    default: {},
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
        prefetch: vi.fn(),
        refresh: vi.fn(),
    }),
    usePathname: () => "/chat",
}));

vi.mock("@/components/chat/AegisNotebook", () => ({
    AegisNotebook: ({ collapsed }: { collapsed: boolean }) => <div data-testid="aegis-notebook" data-collapsed={String(collapsed)} />,
}));

vi.mock("@/components/ui/Select", () => ({
    Select: ({ value, onChange, disabled, ariaLabel }: { value: string; onChange: (value: string) => void; disabled?: boolean; ariaLabel?: string }) => (
        <select aria-label={ariaLabel ?? "select"} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
            <option value={value}>{value}</option>
        </select>
    ),
}));

vi.mock("react-icons/fa", () => ({
    FaArchive: () => <span data-testid="icon-archive" />,
    FaArrowRight: () => <span data-testid="icon-send" />,
    FaBars: () => <span data-testid="icon-bars" />,
    FaBook: () => <span data-testid="icon-book" />,
    FaBriefcase: () => <span data-testid="icon-briefcase" />,
    FaCheck: () => <span data-testid="icon-check" />,
    FaChevronDown: () => <span data-testid="icon-chevron-down" />,
    FaComments: () => <span data-testid="icon-comments" />,
    FaEdit: () => <span data-testid="icon-edit" />,
    FaExclamationTriangle: () => <span data-testid="icon-warning" />,
    FaGlobe: () => <span data-testid="icon-globe" />,
    FaPaperclip: () => <span data-testid="icon-paperclip" />,
    FaPlus: () => <span data-testid="icon-plus" />,
    FaRedo: () => <span data-testid="icon-redo" />,
    FaSave: () => <span data-testid="icon-save" />,
    FaSearch: () => <span data-testid="icon-search" />,
    FaStop: () => <span data-testid="icon-stop" />,
    FaTimes: () => <span data-testid="icon-times" />,
}));

vi.mock("react-icons/si", () => ({
    SiAnthropic: () => <span data-testid="icon-claude" />,
    SiGooglegemini: () => <span data-testid="icon-gemini" />,
    SiOpenai: () => <span data-testid="icon-openai" />,
}));

function createQueuedRunStream(runId: string): Response {
    const encoder = new TextEncoder();
    const event = {
        type: "aegis.stage",
        sequence: 1,
        stage: "queued",
        message: "Aegis chat run queued.",
        payload: { runId },
    };

    return new Response(new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(`event: aegis.stage\ndata: ${JSON.stringify(event)}\n\n`));
            controller.close();
        },
    }), { status: 200, headers: { "content-type": "text/event-stream" } });
}

function createCompletedRun(finalResponse: string, actionStatus = "waiting_approval", approvalStatus = "pending") {
    return {
        id: "run-1",
        status: "completed",
        finalResponse,
        error: null,
        traces: [
            {
                type: "aegis.approval_required",
                sequence: 2,
                stage: "approval",
                message: "Approve cost basis update?",
                payload: {
                    actionId: "action-1",
                    tool: "portfolio.acquiredPrice.update",
                    risk: "edit",
                    input: { inventoryItemId: "inventory-1", acquiredPrice: 12.34 },
                },
                error: null,
            },
        ],
        actions: [
            {
                id: "action-1",
                tool: "portfolio.acquiredPrice.update",
                status: actionStatus,
                risk: "edit",
                input: { inventoryItemId: "inventory-1", acquiredPrice: 12.34 },
                output: null,
                inputPreview: null,
                outputPreview: null,
                approval: { status: approvalStatus },
            },
        ],
    };
}

describe("AIChat", () => {
    beforeEach(() => {
        Element.prototype.scrollIntoView = vi.fn();
        let uuidCounter = 0;
        const nextUuid = () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}` as ReturnType<Crypto["randomUUID"]>;

        vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
            const url = String(input);

            if (url === "/api/chat/sessions") {
                return {
                    ok: true,
                    json: async () => ({ success: true, data: [] }),
                } as Response;
            }

            if (url === "/api/settings") {
                return {
                    ok: true,
                    json: async () => ({ data: { activeAIProvider: "gemini-flash" } }),
                } as Response;
            }

            throw new Error(`Unexpected fetch: ${url}`);
        }) as typeof fetch);

        if (!globalThis.crypto) {
            Object.defineProperty(globalThis, "crypto", {
                value: { randomUUID: nextUuid },
                configurable: true,
            });
        } else {
            vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(nextUuid);
        }
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("inserts an item mention from the shared selection event, focuses the composer, and does not submit", async () => {
        render(<AIChat />);

        const textarea = await screen.findByRole("textbox", { name: "Chat message input" });
        fireEvent.change(textarea, { target: { value: "Compare" } });
        textarea.focus();
        textarea.setSelectionRange(7, 7);

        window.dispatchEvent(new CustomEvent(AEGIS_ITEM_SELECTED_EVENT, {
            detail: {
                hashName: "AK-47 | Redline (Field-Tested)",
                id: "item-redline-ft",
                name: "AK-47 Redline",
                imageUrl: null,
                category: "weapon",
                rarity: "Classified",
                exterior: "Field-Tested",
                type: "Rifle",
            },
        }));

        const expectedValue = `Compare ${formatItemMention("AK-47 | Redline (Field-Tested)")}`;

        await waitFor(() => {
            expect(textarea).toHaveValue(expectedValue);
        });

        await waitFor(() => {
            expect(textarea).toHaveFocus();
        });

        expect(textarea.selectionStart).toBe(expectedValue.length);
        expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Attach" })).toBeEnabled();
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("orders Aegis controls as agent, model, then supported reasoning depth", async () => {
        render(<AIChat />);

        const controls = await screen.findByLabelText("Aegis chat controls");
        const controlButtons = within(controls).getAllByRole("button");

        expect(controlButtons).toHaveLength(3);
        expect(controlButtons[0]).toHaveAccessibleName("Consultant");
        expect(controlButtons[0].className).toContain("agentConsultant");
        expect(controlButtons[1]).toHaveAccessibleName("Gemini 3 Flash (Preview)");
        expect(within(controlButtons[1]).getByTestId("icon-gemini")).toBeInTheDocument();
        expect(controlButtons[2]).toHaveAccessibleName("High");
        expect(controlButtons[2].className).toContain("reasoningDepthText");
    });

    it("hides reasoning depth when the selected model has no supported depth", async () => {
        render(<AIChat />);

        const controls = await screen.findByLabelText("Aegis chat controls");
        fireEvent.click(within(controls).getByRole("button", { name: "Gemini 3 Flash (Preview)" }));
        fireEvent.click(screen.getByRole("option", { name: "GPT-4o Mini" }));

        expect(within(controls).getByRole("button", { name: "GPT-4o Mini" })).toBeInTheDocument();
        expect(within(controls).getByTestId("icon-openai")).toBeInTheDocument();
        expect(within(controls).queryByRole("button", { name: "High" })).not.toBeInTheDocument();
        expect(within(controls).getAllByRole("button")).toHaveLength(2);
    });

    it("omits reasoningDepth from chat payloads for unsupported models", async () => {
        const encoder = new TextEncoder();
        const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);

            if (url === "/api/chat/sessions") {
                if (init?.method === "POST") {
                    return {
                        ok: true,
                        json: async () => ({ success: true, data: { id: "session-1", title: "New Chat", createdAt: "", updatedAt: "" } }),
                    } as Response;
                }

                return {
                    ok: true,
                    json: async () => ({ success: true, data: [] }),
                } as Response;
            }

            if (url === "/api/settings") {
                return {
                    ok: true,
                    json: async () => ({ data: { activeAIProvider: "gemini-flash" } }),
                } as Response;
            }

            if (url === "/api/chat") {
                return new Response(new ReadableStream({
                    start(controller) {
                        controller.enqueue(encoder.encode("Done"));
                        controller.close();
                    },
                }), { status: 200 });
            }

            throw new Error(`Unexpected fetch: ${url}`);
        }) as typeof fetch;

        vi.stubGlobal("fetch", fetchMock);
        render(<AIChat />);

        const controls = await screen.findByLabelText("Aegis chat controls");
        fireEvent.click(within(controls).getByRole("button", { name: "Gemini 3 Flash (Preview)" }));
        fireEvent.click(screen.getByRole("option", { name: "GPT-4o Mini" }));

        fireEvent.change(screen.getByRole("textbox", { name: "Chat message input" }), { target: { value: "Analyze my watchlist" } });
        fireEvent.click(screen.getByRole("button", { name: "Send message" }));

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ method: "POST" }));
        });

        const chatCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/chat");
        const chatInit = chatCall?.[1];
        if (!chatInit || typeof chatInit.body !== "string") {
            throw new Error("Expected /api/chat request with JSON body");
        }

        const payload = JSON.parse(chatInit.body) as { provider?: string; reasoningDepth?: string; agentMode?: string };
        expect(payload.provider).toBe("openai");
        expect(payload.agentMode).toBe("consultant");
        expect(payload).not.toHaveProperty("reasoningDepth");
    });

    it("shows an OpenRouter model input and sends the selected model id", async () => {
        const encoder = new TextEncoder();
        const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);

            if (url === "/api/chat/sessions") {
                if (init?.method === "POST") {
                    return {
                        ok: true,
                        json: async () => ({ success: true, data: { id: "session-1", title: "New Chat", createdAt: "", updatedAt: "" } }),
                    } as Response;
                }

                return {
                    ok: true,
                    json: async () => ({ success: true, data: [] }),
                } as Response;
            }

            if (url === "/api/settings") {
                return {
                    ok: true,
                    json: async () => ({ data: { activeAIProvider: "gemini-flash" } }),
                } as Response;
            }

            if (url === "/api/chat") {
                return new Response(new ReadableStream({
                    start(controller) {
                        controller.enqueue(encoder.encode("Done"));
                        controller.close();
                    },
                }), { status: 200 });
            }

            throw new Error(`Unexpected fetch: ${url}`);
        }) as typeof fetch;

        vi.stubGlobal("fetch", fetchMock);
        render(<AIChat />);

        const controls = await screen.findByLabelText("Aegis chat controls");
        fireEvent.click(within(controls).getByRole("button", { name: "Gemini 3 Flash (Preview)" }));
        fireEvent.click(screen.getByRole("option", { name: "OpenRouter" }));

        const openRouterModelInput = screen.getByRole("combobox", { name: "OpenRouter model" });
        expect(openRouterModelInput).toHaveValue("openai/gpt-latest");
        fireEvent.change(openRouterModelInput, { target: { value: "openai/gpt-oss-120b" } });

        fireEvent.change(screen.getByRole("textbox", { name: "Chat message input" }), { target: { value: "Use GPT OSS" } });
        fireEvent.click(screen.getByRole("button", { name: "Send message" }));

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ method: "POST" }));
        });

        const chatCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/chat");
        const chatInit = chatCall?.[1];
        if (!chatInit || typeof chatInit.body !== "string") {
            throw new Error("Expected /api/chat request with JSON body");
        }

        const payload = JSON.parse(chatInit.body) as { provider?: string; openRouterModelId?: string; reasoningDepth?: string };
        expect(payload.provider).toBe("openrouter");
        expect(payload.openRouterModelId).toBe("openai/gpt-oss-120b");
        expect(payload).not.toHaveProperty("reasoningDepth");
    });

    it("keeps the composer editable and queues one replaceable follow-up while streaming", async () => {
        const encoder = new TextEncoder();
        const streamControllers: ReadableStreamDefaultController<Uint8Array>[] = [];
        const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);

            if (url === "/api/chat/sessions") {
                if (init?.method === "POST") {
                    return {
                        ok: true,
                        json: async () => ({ success: true, data: { id: "session-1", title: "New Chat", createdAt: "", updatedAt: "" } }),
                    } as Response;
                }

                return {
                    ok: true,
                    json: async () => ({ success: true, data: [] }),
                } as Response;
            }

            if (url === "/api/settings") {
                return {
                    ok: true,
                    json: async () => ({ data: { activeAIProvider: "gemini-flash" } }),
                } as Response;
            }

            if (url === "/api/chat") {
                return new Response(new ReadableStream<Uint8Array>({
                    start(controller) {
                        streamControllers.push(controller);
                        controller.enqueue(encoder.encode("streaming"));
                    },
                }), { status: 200 });
            }

            throw new Error(`Unexpected fetch: ${url}`);
        }) as typeof fetch;

        vi.stubGlobal("fetch", fetchMock);
        render(<AIChat />);

        const textarea = await screen.findByRole("textbox", { name: "Chat message input" });
        fireEvent.change(textarea, { target: { value: "first request" } });
        fireEvent.click(screen.getByRole("button", { name: "Send message" }));

        await waitFor(() => {
            expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/chat")).toHaveLength(1);
        });

        expect(await screen.findByRole("button", { name: "Stop generating" })).toBeInTheDocument();
        const activeTextarea = screen.getByRole("textbox", { name: "Chat message input" });
        expect(activeTextarea).toBeEnabled();
        expect(screen.getByRole("button", { name: "Attach" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "New chat" })).toBeDisabled();

        const controls = screen.getByLabelText("Aegis chat controls");
        expect(within(controls).getByRole("button", { name: "Consultant" })).toBeDisabled();
        expect(within(controls).getByRole("button", { name: "Gemini 3 Flash (Preview)" })).toBeDisabled();
        expect(within(controls).getByRole("button", { name: "High" })).toBeDisabled();

        fireEvent.change(activeTextarea, { target: { value: "second request" } });
        await waitFor(() => {
            expect(screen.getByRole("button", { name: "Queue follow-up" })).toBeEnabled();
        });
        fireEvent.click(screen.getByRole("button", { name: "Queue follow-up" }));

        await waitFor(() => {
            expect(activeTextarea).toHaveValue("");
            expect(screen.getByRole("status")).toHaveTextContent("Queued follow-up: second request");
        });

        fireEvent.change(activeTextarea, { target: { value: "replacement request" } });
        await waitFor(() => {
            expect(screen.getByRole("button", { name: "Queue follow-up" })).toBeEnabled();
        });
        fireEvent.click(screen.getByRole("button", { name: "Queue follow-up" }));

        await waitFor(() => {
            expect(screen.getByRole("status")).toHaveTextContent("Queued follow-up: replacement request");
        });

        await act(async () => {
            streamControllers[0].enqueue(encoder.encode(" done"));
            streamControllers[0].close();
        });

        await waitFor(() => {
            expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/chat")).toHaveLength(2);
        });

        const secondChatCall = fetchMock.mock.calls.filter(([input]) => String(input) === "/api/chat")[1];
        const secondChatInit = secondChatCall?.[1];
        if (!secondChatInit || typeof secondChatInit.body !== "string") {
            throw new Error("Expected queued /api/chat request with JSON body");
        }

        const payload = JSON.parse(secondChatInit.body) as { messages: { content: string }[] };
        expect(payload.messages.at(-1)?.content).toBe("replacement request");
        expect(payload.messages.some((message) => message.content === "second request")).toBe(false);

        await act(async () => {
            streamControllers[1]?.close();
        });
    });

    it("ignores same-tick duplicate sends before the loading state renders", async () => {
        const encoder = new TextEncoder();
        const streamControllers: ReadableStreamDefaultController<Uint8Array>[] = [];
        const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);

            if (url === "/api/chat/sessions") {
                if (init?.method === "POST") {
                    return {
                        ok: true,
                        json: async () => ({ success: true, data: { id: "session-1", title: "New Chat", createdAt: "", updatedAt: "" } }),
                    } as Response;
                }

                return {
                    ok: true,
                    json: async () => ({ success: true, data: [] }),
                } as Response;
            }

            if (url === "/api/settings") {
                return {
                    ok: true,
                    json: async () => ({ data: { activeAIProvider: "gemini-flash" } }),
                } as Response;
            }

            if (url === "/api/chat") {
                return new Response(new ReadableStream<Uint8Array>({
                    start(controller) {
                        streamControllers.push(controller);
                        controller.enqueue(encoder.encode("streaming"));
                    },
                }), { status: 200 });
            }

            throw new Error(`Unexpected fetch: ${url}`);
        }) as typeof fetch;

        vi.stubGlobal("fetch", fetchMock);
        render(<AIChat />);

        const textarea = await screen.findByRole("textbox", { name: "Chat message input" });
        fireEvent.change(textarea, { target: { value: "first request" } });

        const sendButton = screen.getByRole("button", { name: "Send message" });
        fireEvent.click(sendButton);
        fireEvent.click(sendButton);

        await waitFor(() => {
            expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/chat")).toHaveLength(1);
        });

        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(screen.getAllByText("first request")).toHaveLength(1);

        await act(async () => {
            streamControllers[0]?.close();
        });
    });

    it("completes a stalled partial stream after idle and sends the next prompt normally", async () => {
        const encoder = new TextEncoder();
        let chatRequestCount = 0;
        const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);

            if (url === "/api/chat/sessions") {
                if (init?.method === "POST") {
                    return {
                        ok: true,
                        json: async () => ({ success: true, data: { id: "session-1", title: "New Chat", createdAt: "", updatedAt: "" } }),
                    } as Response;
                }

                return {
                    ok: true,
                    json: async () => ({ success: true, data: [] }),
                } as Response;
            }

            if (url === "/api/settings") {
                return {
                    ok: true,
                    json: async () => ({ data: { activeAIProvider: "gemini-flash" } }),
                } as Response;
            }

            if (url === "/api/chat") {
                chatRequestCount += 1;

                if (chatRequestCount === 1) {
                    return new Response(new ReadableStream<Uint8Array>({
                        start(controller) {
                            controller.enqueue(encoder.encode("partial"));
                        },
                    }), { status: 200 });
                }

                return new Response(new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(encoder.encode("complete"));
                        controller.close();
                    },
                }), { status: 200 });
            }

            throw new Error(`Unexpected fetch: ${url}`);
        }) as typeof fetch;

        vi.stubGlobal("fetch", fetchMock);
        render(<AIChat />);

        const textarea = await screen.findByRole("textbox", { name: "Chat message input" });
        fireEvent.change(textarea, { target: { value: "first request" } });
        fireEvent.click(screen.getByRole("button", { name: "Send message" }));

        await waitFor(() => {
            expect(chatRequestCount).toBe(1);
        });

        expect(await screen.findByText("partial")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Stop generating" })).toBeInTheDocument();

        await act(async () => {
            await new Promise((resolve) => window.setTimeout(resolve, 1100));
        });

        await waitFor(() => {
            expect(screen.queryByRole("button", { name: "Stop generating" })).not.toBeInTheDocument();
        });

        expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
        expect(screen.queryByRole("status")).not.toBeInTheDocument();

        fireEvent.change(screen.getByRole("textbox", { name: "Chat message input" }), { target: { value: "fresh request" } });
        fireEvent.click(screen.getByRole("button", { name: "Send message" }));

        await waitFor(() => {
            expect(chatRequestCount).toBe(2);
        });

        const secondChatCall = fetchMock.mock.calls.filter(([request]) => String(request) === "/api/chat")[1];
        const secondChatInit = secondChatCall?.[1];
        if (!secondChatInit || typeof secondChatInit.body !== "string") {
            throw new Error("Expected second /api/chat request with JSON body");
        }

        const payload = JSON.parse(secondChatInit.body) as { messages: { content: string }[] };
        expect(payload.messages.at(-1)?.content).toBe("fresh request");
    });

    it("unlocks the composer after the chat API returns an error", async () => {
        const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);

            if (url === "/api/chat/sessions") {
                if (init?.method === "POST") {
                    return {
                        ok: true,
                        json: async () => ({ success: true, data: { id: "session-1", title: "New Chat", createdAt: "", updatedAt: "" } }),
                    } as Response;
                }

                return {
                    ok: true,
                    json: async () => ({ success: true, data: [] }),
                } as Response;
            }

            if (url === "/api/settings") {
                return {
                    ok: true,
                    json: async () => ({ data: { activeAIProvider: "gemini-flash" } }),
                } as Response;
            }

            if (url === "/api/chat") {
                return new Response(JSON.stringify({ error: "Provider failed" }), {
                    status: 500,
                    headers: { "content-type": "application/json" },
                });
            }

            throw new Error(`Unexpected fetch: ${url}`);
        }) as typeof fetch;

        vi.stubGlobal("fetch", fetchMock);
        render(<AIChat />);

        const textarea = await screen.findByRole("textbox", { name: "Chat message input" });
        fireEvent.change(textarea, { target: { value: "trigger failure" } });
        fireEvent.click(screen.getByRole("button", { name: "Send message" }));

        await waitFor(() => {
            expect(screen.getByText("Provider failed")).toBeInTheDocument();
        });

        expect(screen.queryByRole("button", { name: "Stop generating" })).not.toBeInTheDocument();
        expect(screen.getByRole("textbox", { name: "Chat message input" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Attach" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "New chat" })).toBeEnabled();
    });

    it("polls the durable Aegis run after the chat route queues it", async () => {
        const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);

            if (url === "/api/chat/sessions") {
                if (init?.method === "POST") {
                    return {
                        ok: true,
                        json: async () => ({ success: true, data: { id: "session-1", title: "New Chat", createdAt: "", updatedAt: "" } }),
                    } as Response;
                }

                return {
                    ok: true,
                    json: async () => ({ success: true, data: [] }),
                } as Response;
            }

            if (url === "/api/settings") {
                return {
                    ok: true,
                    json: async () => ({ data: { activeAIProvider: "gemini-flash" } }),
                } as Response;
            }

            if (url === "/api/chat") {
                return createQueuedRunStream("run-1");
            }

            if (url === "/api/aegis/runs/run-1") {
                return {
                    ok: true,
                    json: async () => ({ success: true, data: createCompletedRun("Durable response ready") }),
                } as Response;
            }

            throw new Error(`Unexpected fetch: ${url}`);
        }) as typeof fetch;

        vi.stubGlobal("fetch", fetchMock);
        render(<AIChat />);

        const textarea = await screen.findByRole("textbox", { name: "Chat message input" });
        fireEvent.change(textarea, { target: { value: "set my cost basis to 12.34" } });
        fireEvent.click(screen.getByRole("button", { name: "Send message" }));

        expect(await screen.findByText("Durable response ready")).toBeInTheDocument();
        expect(await screen.findByRole("button", { name: "Approve Aegis action" })).toBeEnabled();
        expect(screen.getByText("portfolio.acquiredPrice.update")).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledWith("/api/aegis/runs/run-1");
    });

    it("includes the attached portfolio item id in the chat payload", async () => {
        const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);

            if (url === "/api/chat/sessions") {
                if (init?.method === "POST") {
                    return {
                        ok: true,
                        json: async () => ({ success: true, data: { id: "session-1", title: "New Chat", createdAt: "", updatedAt: "" } }),
                    } as Response;
                }

                return {
                    ok: true,
                    json: async () => ({ success: true, data: [] }),
                } as Response;
            }

            if (url === "/api/settings") {
                return {
                    ok: true,
                    json: async () => ({ data: { activeAIProvider: "gemini-flash" } }),
                } as Response;
            }

            if (url === "/api/portfolio") {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        data: {
                            items: [{
                                id: "inventory-1",
                                itemId: "item-1",
                                name: "AK-47 | Redline",
                                marketHashName: "AK-47 | Redline (Field-Tested)",
                                imageUrl: null,
                                currentPrice: 22.5,
                                category: "weapon",
                                rarity: "Classified",
                                exterior: "Field-Tested",
                            }],
                        },
                    }),
                } as Response;
            }

            if (url === "/api/chat") {
                return createQueuedRunStream("run-1");
            }

            if (url === "/api/aegis/runs/run-1") {
                return {
                    ok: true,
                    json: async () => ({ success: true, data: createCompletedRun("Durable response ready") }),
                } as Response;
            }

            throw new Error(`Unexpected fetch: ${url}`);
        }) as typeof fetch;

        vi.stubGlobal("fetch", fetchMock);
        render(<AIChat />);

        fireEvent.click(await screen.findByRole("button", { name: "Attach" }));
        fireEvent.click(screen.getByRole("menuitem", { name: /Portfolio item/i }));
        fireEvent.click(await screen.findByRole("button", { name: /AK-47 \| Redline/i }));

        const textarea = screen.getByRole("textbox", { name: "Chat message input" });
        fireEvent.change(textarea, { target: { value: "set cost basis to 12.34" } });
        fireEvent.click(screen.getByRole("button", { name: "Send message" }));

        await screen.findByText("Durable response ready");

        const chatCall = fetchMock.mock.calls.find(([request]) => String(request) === "/api/chat");
        const chatInit = chatCall?.[1];
        if (!chatInit || typeof chatInit.body !== "string") {
            throw new Error("Expected /api/chat request with JSON body");
        }

        const payload = JSON.parse(chatInit.body) as { messages: { content: string }[] };
        expect(payload.messages.at(-1)?.content).toContain("portfolio item inventory-1");
        expect(payload.messages.at(-1)?.content).toContain("AK-47 | Redline (AK-47 | Redline (Field-Tested))");
    });

    it("rehydrates persisted approval state from durable run history", async () => {
        const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
            const url = String(input);

            if (url === "/api/chat/sessions") {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        data: [{ id: "session-1", title: "Existing Chat", createdAt: "", updatedAt: "", _count: { messages: 2 } }],
                    }),
                } as Response;
            }

            if (url === "/api/settings") {
                return {
                    ok: true,
                    json: async () => ({ data: { activeAIProvider: "gemini-flash" } }),
                } as Response;
            }

            if (url === "/api/chat/history?sessionId=session-1") {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        data: [
                            { id: "msg-user", role: "user", content: "set my cost basis", metadata: null, createdAt: "" },
                            {
                                id: "msg-assistant",
                                role: "assistant",
                                content: "Queued response",
                                metadata: JSON.stringify({ durableRunId: "run-1", provider: "gemini-flash", agentMode: "consultant" }),
                                createdAt: "",
                            },
                        ],
                    }),
                } as Response;
            }

            if (url === "/api/aegis/runs/run-1") {
                return {
                    ok: true,
                    json: async () => ({ success: true, data: createCompletedRun("Persisted durable answer", "succeeded", "approved") }),
                } as Response;
            }

            throw new Error(`Unexpected fetch: ${url}`);
        }) as typeof fetch;

        vi.stubGlobal("fetch", fetchMock);
        render(<AIChat initialSessionId="session-1" />);

        expect(await screen.findByText("Persisted durable answer")).toBeInTheDocument();
        expect(await screen.findByText("succeeded")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Approve Aegis action" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Reject Aegis action" })).toBeDisabled();
    });
});
