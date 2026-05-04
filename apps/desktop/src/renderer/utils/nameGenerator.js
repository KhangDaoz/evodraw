const adjectives = ['Anonymous','Curious','Brave','Clever','Happy','Swift','Silent','Wandering','Mysterious','Gentle'];
const animals = ['Panda','Penguin','Koala','Tiger','Elephant','Dolphin','Eagle','Cheetah','Wolf','Fox'];

export function generateAnonymousName() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${adj} ${animal}`;
}
