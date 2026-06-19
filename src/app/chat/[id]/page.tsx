import styles from "../Chat.module.css";
import AIChat from "@/components/chat/AIChat";

export const metadata = {
    title: "Aegis",
    description: "Forecast value, analyze volume, and optimize risk with Aegis.",
};

interface ChatSessionPageProps {
    params: Promise<{ id: string }>;
}

export default async function ChatSessionPage({ params }: ChatSessionPageProps) {
    const { id } = await params;
    return (
        <div className={styles.page} data-testid="route-chat">
            <AIChat initialSessionId={id} />
        </div>
    );
}
