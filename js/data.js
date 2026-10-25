// This is the only data-access module. A later stage can replace its internals
// with Supabase while keeping the page scripts independent of the data source.
export async function loadSpaces() {
  const response = await fetch(new URL('../data/spaces.json', import.meta.url));
  if (!response.ok) throw new Error(`Could not load spaces (${response.status}).`);
  const spaces = await response.json();
  if (!Array.isArray(spaces)) throw new Error('The listing data is not an array.');
  return spaces;
}
