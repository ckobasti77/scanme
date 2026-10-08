// Sajam 2026 — the survey belongs to the exhibitor (owner decision): once it
// is sent on one model, its bubble stays away from every other model of the
// same exhibitor at this event. The backend stores one response per visitor
// and MODEL, so the exhibitor-wide rule is this local marker.

type MarkerStorage = Pick<Storage, "getItem" | "setItem">;

export function fairSurveyMarkerKey(eventId: string, participationId: string): string {
  return `scanme:fair-survey-done:v1:${eventId}:${participationId}`;
}

export function hasFairSurveyMarker(storage: MarkerStorage | null, eventId: string, participationId: string): boolean {
  try {
    return storage?.getItem(fairSurveyMarkerKey(eventId, participationId)) === "1";
  } catch {
    return false;
  }
}

export function setFairSurveyMarker(storage: MarkerStorage | null, eventId: string, participationId: string): void {
  try {
    storage?.setItem(fairSurveyMarkerKey(eventId, participationId), "1");
  } catch {
    // Without storage the server state still hides this model's own survey.
  }
}
