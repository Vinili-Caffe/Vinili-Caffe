function hpImage(name?) {
  return `personaggi/${String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}.png`;
}

const HOGWARTS_CHARACTER_BANK = [
  { name: "Harry Potter", aliases: [], house: "Grifondoro", role: "Cercatore", imageFile: hpImage("Harry Potter") },
  { name: "Hermione Granger", aliases: [], house: "Grifondoro", role: "Strega", imageFile: hpImage("Hermione Granger") },
  { name: "Ron Weasley", aliases: [], house: "Grifondoro", role: "Mago", imageFile: hpImage("Ron Weasley") },
  { name: "Albus Silente", aliases: ["Silente", "Dumbledore", "Albus Dumbledore"], house: "Hogwarts", role: "Preside", imageFile: hpImage("Albus Silente") },
  { name: "Severus Piton", aliases: ["Snape", "Severus Snape"], house: "Serpeverde", role: "Professore di Pozioni", imageFile: hpImage("Severus Piton") },
  { name: "Rubeus Hagrid", aliases: ["Hagrid"], house: "Hogwarts", role: "Guardiacaccia", imageFile: hpImage("Rubeus Hagrid") },
  { name: "Draco Malfoy", aliases: [], house: "Serpeverde", role: "Mago", imageFile: hpImage("Draco Malfoy") },
  { name: "Sirius Black", aliases: [], house: "Grifondoro", role: "Padrino", imageFile: hpImage("Sirius Black") },
  { name: "Remus Lupin", aliases: [], house: "Grifondoro", role: "Professore", imageFile: hpImage("Remus Lupin") },
  { name: "Dobby", aliases: ["Dobby l'elfo"], house: "Libero", role: "Elfo domestico", imageFile: hpImage("Dobby") },
  { name: "Lord Voldemort", aliases: ["Voldemort", "Tom Riddle", "Tom Morvolo Riddle"], house: "Serpeverde", role: "Mago oscuro", imageFile: hpImage("Lord Voldemort") },
  { name: "Minerva McGranitt", aliases: ["McGranitt"], house: "Grifondoro", role: "Professoressa", imageFile: hpImage("Minerva McGranitt") },
  { name: "Neville Longbottom", aliases: [], house: "Grifondoro", role: "Mago", imageFile: hpImage("Neville Longbottom") },
  { name: "Luna Lovegood", aliases: [], house: "Corvonero", role: "Strega", imageFile: hpImage("Luna Lovegood") },
  { name: "Cedric Diggory", aliases: [], house: "Tassorosso", role: "Cercatore", imageFile: hpImage("Cedric Diggory") },
  { name: "Bellatrix Lestrange", aliases: [], house: "Serpeverde", role: "Mangiamorte", imageFile: hpImage("Bellatrix Lestrange") },
  { name: "Dolores Umbridge", aliases: [], house: "Ministero", role: "Ispettrice", imageFile: hpImage("Dolores Umbridge") },
  { name: "Gilderoy Lockhart", aliases: [], house: "Hogwarts", role: "Professore", imageFile: hpImage("Gilderoy Lockhart") },
  { name: "Cho Chang", aliases: [], house: "Corvonero", role: "Cercatrice", imageFile: hpImage("Cho Chang") },
  { name: "Fleur Delacour", aliases: [], house: "Beauxbatons", role: "Campione", imageFile: hpImage("Fleur Delacour") },
  { name: "Charlie Weasley", aliases: [], house: "Grifondoro", role: "Domatore di draghi", imageFile: hpImage("Charlie Weasley") },
  { name: "Fred Weasley", aliases: [], house: "Grifondoro", role: "Gemello", imageFile: hpImage("Fred Weasley") },
  { name: "George Weasley", aliases: [], house: "Grifondoro", role: "Gemello", imageFile: hpImage("George Weasley") },
  { name: "Ginny Weasley", aliases: ["Ginevra Weasley"], house: "Grifondoro", role: "Cercatrice", imageFile: hpImage("Ginny Weasley") },
  { name: "Molly Weasley", aliases: [], house: "Grifondoro", role: "Strega", imageFile: hpImage("Molly Weasley") },
  { name: "Arthur Weasley", aliases: [], house: "Grifondoro", role: "Ministero", imageFile: hpImage("Arthur Weasley") },
  { name: "Lucius Malfoy", aliases: [], house: "Serpeverde", role: "Mangiamorte", imageFile: hpImage("Lucius Malfoy") },
  { name: "Narcissa Malfoy", aliases: [], house: "Serpeverde", role: "Strega", imageFile: hpImage("Narcissa Malfoy") },
  { name: "Peter Pettigrew", aliases: ["Wormtail", "Coda di Verme"], house: "Grifondoro", role: "Mangiamorte", imageFile: hpImage("Peter Pettigrew") },
  { name: "James Potter", aliases: ["Prongs"], house: "Grifondoro", role: "Mago", imageFile: hpImage("James Potter") },
  { name: "Lily Potter", aliases: ["Lily Evans"], house: "Grifondoro", role: "Strega", imageFile: hpImage("Lily Potter") },
];

function getHogwartsCharacterBank() {
  return HOGWARTS_CHARACTER_BANK;
}

export = { getHogwartsCharacterBank };