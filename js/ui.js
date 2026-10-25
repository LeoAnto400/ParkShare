export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function parkingImage(photo, title) {
  const image = element('img');
  image.alt = `${photo.alt} — ${title}`;
  image.loading = 'lazy';
  // Listen before setting src. The once option prevents a broken fallback loop.
  image.addEventListener('error', () => {
    image.src = 'assets/parking-fallback.svg';
    image.alt = `Parking illustration; photo unavailable for ${title}`;
  }, { once: true });
  image.src = photo.src;
  return image;
}

export function renderCards(container, spaces, search = '') {
  const fragment = document.createDocumentFragment();
  for (const space of spaces) {
    const card = element('article', 'card');
    const media = element('div', 'card-image');
    media.append(parkingImage(space.photos[0], space.title), element('span', 'image-label', space.ownerId ? 'Owner listing' : 'Fictional sample'));
    const body = element('div', 'card-body');
    body.append(element('p', 'locality', `${space.locality} · ${space.city}`), element('h3', '', space.title), element('p', 'vehicles', space.vehicles.join(' / ')));
    const chips = element('div', 'chips');
    for (const amenity of space.amenities) chips.append(element('span', 'chip', amenity));
    const bottom = element('div', 'card-bottom');
    const price = element('span');
    price.append(element('strong', '', `₹${space.price}`), document.createTextNode(' / hour'));
    const link = element('a', '', 'View space ↗');
    const params = new URLSearchParams({ id: space.id });
    if (search) params.set('location', search);
    link.href = `space.html?${params}`;
    link.setAttribute('aria-label', `View ${space.title}`);
    bottom.append(price, link);
    body.append(chips, bottom);
    card.append(media, body);
    fragment.append(card);
  }
  // Replace only the results, leaving the form and keyboard focus intact.
  container.replaceChildren(fragment);
}
