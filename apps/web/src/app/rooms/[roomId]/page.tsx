import { RoomExperience } from './RoomExperience';

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <RoomExperience roomId={roomId.toUpperCase()} />;
}
