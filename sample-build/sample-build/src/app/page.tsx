import { ChatApp } from "@/components/chat/ChatApp";
import { listConversations } from "@/lib/conversations";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const conversations = await listConversations();
  return <ChatApp initialConversations={conversations} />;
}
