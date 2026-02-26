import styles from './Chat.module.css';
import AIChat from "@/components/chat/AIChat";

export const metadata = {
    title: "AI Agent | CS2Vault",
    description: "Chat with the CS2 Market AI Agent.",
};

export default function ChatPage() {
    return (
        <div className={styles.page}>
            <AIChat />
        </div>
    );
}
