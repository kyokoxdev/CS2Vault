import AIChat from "@/components/chat/AIChat";

export const metadata = {
    title: "AI Agent | CS2Vault",
    description: "Chat with the CS2 Market AI Agent.",
};

export default function ChatPage() {
    return (
        <div style={{ height: "calc(100vh - 120px)", display: "flex", flexDirection: "column" }}>
            <AIChat />
        </div>
    );
}
