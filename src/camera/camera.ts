export interface CameraHandle {
  readonly stream: MediaStream;
  readonly track: MediaStreamTrack;
  setTorch(on: boolean): Promise<boolean>;
  stop(): void;
}

export async function openCamera(): Promise<CameraHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  });
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error("no camera track");

  return {
    stream,
    track,
    async setTorch(on: boolean): Promise<boolean> {
      try {
        const constraints = {
          advanced: [{ torch: on }],
        } as unknown as MediaTrackConstraints;
        await track.applyConstraints(constraints);
        return true;
      } catch {
        return false;
      }
    },
    stop(): void {
      for (const t of stream.getTracks()) t.stop();
    },
  };
}
