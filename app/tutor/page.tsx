import { redirect } from 'next/navigation';

/**
 * `/tutor` was the chat's old address; the chat is now the app's home (`/`).
 * Keep the old link working for bookmarks and handoff links.
 */
export default function TutorRedirect() {
  redirect('/');
}
