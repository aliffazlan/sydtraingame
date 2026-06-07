function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function s(name, lines, aliases = []) {
  return { id: slug(name), name, lines, aliases };
}

const STATIONS = [
  s("Tallawong", ["M1"]), s("Rouse Hill", ["M1"]), s("Kellyville", ["M1"]), s("Bella Vista", ["M1"]), s("Norwest", ["M1"]),
  s("Hills Showground", ["M1"]), s("Castle Hill", ["M1"]), s("Cherrybrook", ["M1"]), s("Epping", ["M1", "T9"]),
  s("Macquarie University", ["M1", "T9"]), s("Macquarie Park", ["M1", "T9"]), s("North Ryde", ["M1"]), s("Chatswood", ["M1", "T1", "T9"]),
  s("Crows Nest", ["M1"]), s("Victoria Cross", ["M1"]), s("Barangaroo", ["M1"]), s("Gadigal", ["M1"]), s("Waterloo", ["M1"]),
  s("Berowra", ["T1"]), s("Mount Kuring-gai", ["T1"], ["Mt Kuring-gai"]), s("Mount Colah", ["T1"], ["Mt Colah"]), s("Asquith", ["T1"]),
  s("Hornsby", ["T1", "T9"]), s("Waitara", ["T1", "T9"]), s("Wahroonga", ["T1", "T9"]), s("Warrawee", ["T1", "T9"]),
  s("Turramurra", ["T1", "T9"]), s("Pymble", ["T1", "T9"]), s("Gordon", ["T1", "T9"]), s("Killara", ["T1", "T9"]),
  s("Lindfield", ["T1", "T9"]), s("Roseville", ["T1", "T9"]), s("Artarmon", ["T1", "T9"]), s("St Leonards", ["T1", "T9"], ["Saint Leonards"]),
  s("Wollstonecraft", ["T1", "T9"]), s("Waverton", ["T1", "T9"]), s("North Sydney", ["T1", "T9"]), s("Milsons Point", ["T1", "T9"]),
  s("Wynyard", ["T1", "T2","T3", "T8", "T9"]), s("Town Hall", ["T1", "T2", "T3", "T4", "T8", "T9"]), s("Central", ["T1", "T2", "T3", "T4", "T8", "T9", "M1"]),
  s("Circular Quay", ["T2", "T3", "T8"]), s("St James", ["T2", "T3", "T8"], ["Saint James"]), s("Museum", ["T2", "T3", "T8"]),
  s("Martin Place", ["T4", "M1"]), s("Emu Plains", ["T1"]), s("Penrith", ["T1"]), s("Kingswood", ["T1"]), s("Werrington", ["T1"]),
  s("St Marys", ["T1"], ["Saint Marys"]), s("Mount Druitt", ["T1"], ["Mt Druitt"]), s("Rooty Hill", ["T1"]), s("Doonside", ["T1"]),
  s("Blacktown", ["T1", "T5"]), s("Seven Hills", ["T1", "T5"]), s("Toongabbie", ["T1", "T5"]), s("Pendle Hill", ["T1", "T5"]), s("Wentworthville", ["T1", "T5"]),
  s("Westmead", ["T1", "T5"]), s("Parramatta", ["T1", "T2", "T5"]), s("Harris Park", ["T1", "T2", "T5"]), s("Granville", ["T1", "T2"]), s("Clyde", ["T1", "T2"]),
  s("Auburn", ["T1", "T2"]), s("Lidcombe", ["T1", "T2", "T3", "T6", "T7"]), s("Flemington", ["T2", "T3"]), s("Homebush", ["T2", "T3"]),
  s("Strathfield", ["T1", "T2", "T3", "T9"]), s("Burwood", ["T1", "T2", "T3", "T9"]), s("Croydon", ["T2", "T3"]), s("Ashfield", ["T2", "T3"]),
  s("Summer Hill", ["T2", "T3"]), s("Lewisham", ["T2", "T3"]), s("Petersham", ["T2", "T3"]), s("Stanmore", ["T2", "T3"]),
  s("Newtown", ["T2", "T3"]), s("Macdonaldtown", ["T2", "T3"], ["MacDonaldtown"]), s("Redfern", ["T1", "T2", "T3", "T4", "T8", "T9"]),
  s("Richmond", ["T1", "T5"]), s("East Richmond", ["T1", "T5"]), s("Clarendon", ["T1", "T5"]), s("Windsor", ["T1", "T5"]), s("Mulgrave", ["T1", "T5"]),
  s("Vineyard", ["T1", "T5"]), s("Riverstone", ["T1", "T5"]), s("Schofields", ["T1", "T5"]), s("Quakers Hill", ["T1", "T5"]), s("Marayong", ["T1", "T5"]),
  s("Leppington", ["T2", "T5"]), s("Edmondson Park", ["T2","T5"]), s("Glenfield", ["T2", "T5","T8"]), s("Casula", ["T2", "T5"]),
  s("Guildford", ["T2", "T5"]), s("Merrylands", ["T2", "T5"]), s("Macquarie Fields", ["T8"]),
  s("Ingleburn", ["T8"]), s("Minto", ["T8"]), s("Leumeah", ["T8"]), s("Campbelltown", ["T8"]), s("Macarthur", ["T8"]),
  s("Liverpool", ["T2", "T5", "T3"]), s("Warwick Farm", ["T2", "T3", "T5"]), s("Cabramatta", ["T2", "T3", "T5"]), s("Carramar", ["T3"]), s("Villawood", ["T3"]),
  s("Leightonfield", ["T3"]), s("Chester Hill", ["T3"]), s("Sefton", ["T3"]), s("Regents Park", ["T3", "T6"]),
  s("Berala", ["T3", "T6"]), s("Birrong", ["T6"]), s("Yagoona", ["T6"]),
  s("Bankstown", ["T6"]), s("Punchbowl", ["T6"]), s("Wiley Park", ["T6"]), s("Lakemba", ["T6"]), s("Belmore", ["T6"]),
  s("Campsie", ["T6"]), s("Canterbury", ["T6"]), s("Hurlstone Park", ["T6"]), s("Dulwich Hill", ["T6"]), s("Marrickville", ["T6"]),
  s("Sydenham", ["T3", "T8", "T4", "M1"]), s("Bondi Junction", ["T4"]), s("Edgecliff", ["T4"]), s("Kings Cross", ["T4"]),
  s("Erskineville", ["T8"]), s("St Peters", ["T8"], ["Saint Peters"]), s("Tempe", ["T4"]), s("Wolli Creek", ["T4", "T8"]),
  s("Arncliffe", ["T4"]), s("Banksia", ["T4"]), s("Rockdale", ["T4"]), s("Kogarah", ["T4"]), s("Carlton", ["T4"]),
  s("Allawah", ["T4"]), s("Hurstville", ["T4"]), s("Penshurst", ["T4"]), s("Mortdale", ["T4"]), s("Oatley", ["T4"]),
  s("Como", ["T4"]), s("Jannali", ["T4"]), s("Sutherland", ["T4"]), s("Loftus", ["T4"]), s("Engadine", ["T4"]),
  s("Heathcote", ["T4"]), s("Waterfall", ["T4"]), s("Kirrawee", ["T4"]), s("Gymea", ["T4"]), s("Miranda", ["T4"]),
  s("Caringbah", ["T4"]), s("Woolooware", ["T4"]), s("Cronulla", ["T4"]), s("Yennora", ["T5"]), s("Fairfield", ["T5"]),
  s("Canley Vale", ["T5"]), s("Olympic Park", ["T7"]), s("Concord West", ["T9"]), s("Rhodes", ["T9"]),
  s("Green Square", ["T8"]), s("Mascot", ["T8"]), s("Domestic Airport", ["T8"]), s("International Airport", ["T8"]),
  s("Turrella", ["T8"]), s("Bardwell Park", ["T8"]), s("Bexley North", ["T8"]), s("Kingsgrove", ["T8"]), s("Beverly Hills", ["T8"]),
  s("Narwee", ["T8"]), s("Riverwood", ["T8"]), s("Padstow", ["T8"]), s("Revesby", ["T8"]), s("Panania", ["T8"]),
  s("East Hills", ["T8"]), s("Holsworthy", ["T8"]), s("Normanhurst", ["T9"]), s("Thornleigh", ["T9"]),
  s("Pennant Hills", ["T9"]), s("Beecroft", ["T9"]), s("Cheltenham", ["T9"]), s("Eastwood", ["T9"]),
  s("Denistone", ["T9"]), s("West Ryde", ["T9"]), s("Meadowbank", ["T9"]), s("North Strathfield", ["T9"])
];

window.STATIONS = STATIONS;
