export type Room = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
};

export type Message = {
  id: string;
  sequence: number;
  room_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  language: 'fr' | 'en';
  created_at: string;
};

type Table<Row> = { Row: Row; Insert: never; Update: never; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      rooms: Table<Room>;
      messages: Table<Message>;
      room_members: Table<{
        room_id: string;
        user_id: string;
        display_name: string;
        joined_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      create_room: { Args: { p_name: string; p_display_name: string }; Returns: string };
      join_room: { Args: { p_token: string; p_display_name: string }; Returns: string };
      rotate_invitation: { Args: { p_room_id: string }; Returns: string };
      send_message: {
        Args: { p_room_id: string; p_id: string; p_body: string; p_language: string };
        Returns: Message[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.sequence - b.sequence);
}
