import type { TranslationKey } from "../../i18n";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import type { NearbyPlace, NearbyPlaceGenericNameKey } from "./nearbyPlaces";
import {
  classifyPlacesRankingCategory,
  type PlacesRankingCategory,
} from "../../services/places/compiledPlaces";
import { fuzzyFilter } from "../../services/fuzzySearch";
import {
  NEARBY_WALKING_MINUTES,
  type NearbyWalkingMinutes,
} from "./nearbyWalkingMinutes";

export { NEARBY_WALKING_MINUTES, type NearbyWalkingMinutes } from "./nearbyWalkingMinutes";
export type NearbyPlaceGroupId =
  | "food-shopping"
  | "restaurants-cafes"
  | "beauty-health"
  | "education"
  | "green-spaces"
  | "fashion-accessories"
  | "home-garden"
  | "toys-leisure"
  | "auto-mobility"
  | "home-tech-mobility"
  | "daily-services"
  | "culture-leisure"
  | "attractions"
  | "other";

export type NearbyPlaceIconId =
  | "basket"
  | "utensils"
  | "health"
  | "education"
  | "tree-pine"
  | "shirt"
  | "home-garden"
  | "toys"
  | "car"
  | "home-tech"
  | "briefcase"
  | "culture"
  | "landmark"
  | "sparkles";

/**
 * Small, provider-independent icon vocabulary shared by the nearby map and
 * destination search. The Presenter owns the concrete Lucide components so
 * this rules module stays independent from Vue rendering.
 */
export type NearbyPlaceMarkerIconId =
  | "armchair"
  | "banknote"
  | "car"
  | "circle-parking"
  | "dog"
  | "flower-2"
  | "mailbox"
  | "milk"
  | "washing-machine"
  | "film"
  | "ear"
  | "sparkles"
  | "drama"
  | "glasses"
  | "skull"
  | "shopping-bag"
  | "apple"
  | "scissors"
  | "laptop"
  | "cross"
  | "shopping-cart"
  | "shirt"
  | "croissant"
  | "ham"
  | "utensils"
  | "landmark"
  | "tree-pine"
  | "school"
  | "dumbbell"
  | "book-open"
  | "wallet-cards";

export type NearbyPlacePresentationSource = Pick<GeocoderPoint, "kind" | "category"> & {
  rankingCategory?: PlacesRankingCategory;
  name?: string;
  label?: string;
  brand?: string;
  operator?: string;
  tags?: Readonly<Record<string, string>>;
  genericNameKey?: NearbyPlaceGenericNameKey;
};

export type NearbyPlaceWheelchairAccess = "yes" | "limited" | "no" | "designated";

const OSM_WHEELCHAIR_ACCESS_VALUES: ReadonlySet<string> = new Set([
  "yes",
  "limited",
  "no",
  "designated",
]);

/** Return only recognized, explicitly recorded OSM wheelchair-access values. */
export function nearbyPlaceWheelchairAccess(
  place: Pick<NearbyPlacePresentationSource, "tags">,
): NearbyPlaceWheelchairAccess | undefined {
  const value = place.tags?.wheelchair?.trim().toLowerCase();
  return value && OSM_WHEELCHAIR_ACCESS_VALUES.has(value)
    ? value as NearbyPlaceWheelchairAccess
    : undefined;
}

export interface NearbyPlaceGroupPresentation {
  id: NearbyPlaceGroupId;
  labelKey: TranslationKey;
  icon: NearbyPlaceIconId;
  tone: string;
}

export interface NearbyPlaceGroupResult extends NearbyPlaceGroupPresentation {
  places: NearbyPlace[];
}

export const NEARBY_DIRECTORY_WALKING_MINUTES = NEARBY_WALKING_MINUTES;
// Keep the directory map warm for the largest selectable walking radius,
// even when the user opens it on the 5 or 10 minute filter first.
export const NEARBY_DIRECTORY_MAX_RADIUS_METERS = Math.max(...NEARBY_DIRECTORY_WALKING_MINUTES) * 80;

export const NEARBY_PLACE_GROUPS: readonly NearbyPlaceGroupPresentation[] = [
  { id: "food-shopping", labelKey: "nearbyStations.directory.groups.foodShopping", icon: "basket", tone: "green" },
  { id: "restaurants-cafes", labelKey: "nearbyStations.directory.groups.restaurantsCafes", icon: "utensils", tone: "orange" },
  { id: "beauty-health", labelKey: "nearbyStations.directory.groups.beautyHealth", icon: "health", tone: "teal" },
  { id: "education", labelKey: "nearbyStations.directory.groups.education", icon: "education", tone: "blue" },
  { id: "green-spaces", labelKey: "nearbyStations.directory.groups.greenSpaces", icon: "tree-pine", tone: "green" },
  { id: "fashion-accessories", labelKey: "nearbyStations.directory.groups.fashionAccessories", icon: "shirt", tone: "pink" },
  { id: "home-garden", labelKey: "nearbyStations.directory.groups.homeGarden", icon: "home-garden", tone: "brown" },
  { id: "toys-leisure", labelKey: "nearbyStations.directory.groups.toysLeisure", icon: "toys", tone: "violet" },
  { id: "auto-mobility", labelKey: "nearbyStations.directory.groups.autoMobility", icon: "car", tone: "red" },
  { id: "home-tech-mobility", labelKey: "nearbyStations.directory.groups.homeTechMobility", icon: "home-tech", tone: "blue" },
  { id: "daily-services", labelKey: "nearbyStations.directory.groups.dailyServices", icon: "briefcase", tone: "indigo" },
  { id: "culture-leisure", labelKey: "nearbyStations.directory.groups.cultureLeisure", icon: "culture", tone: "purple" },
  { id: "attractions", labelKey: "nearbyStations.directory.groups.attractions", icon: "landmark", tone: "amber" },
  { id: "other", labelKey: "nearbyStations.directory.groups.other", icon: "sparkles", tone: "slate" },
] as const;

const KINDS_BY_GROUP: Readonly<Record<Exclude<NearbyPlaceGroupId, "other">, ReadonlySet<string>>> = {
  "food-shopping": new Set(["supermarket", "convenience", "bakery", "butcher", "greengrocer", "deli", "health_food", "marketplace", "alcohol", "tobacco", "vape", "vape_shop", "e_cigarette", "coffee", "tea", "cheese", "chocolate", "confectionery", "pastry", "beverages", "wine", "wine_shop", "bottle", "liquor", "drinks", "beer", "organic", "farm", "seafood", "frozen_food", "kiosk"]),
  "restaurants-cafes": new Set(["restaurant", "cafe", "bar", "pub", "fast_food", "food_court", "ice_cream"]),
  "beauty-health": new Set(["pharmacy", "chemist", "medical_supply", "doctors", "dentist", "clinic", "hospital", "physiotherapist", "healthcare", "optician", "hearing_aids", "hairdresser", "beauty", "cosmetics", "massage", "tattoo", "nail", "perfumery", "health", "sauna", "public_bath"]),
  education: new Set(["school", "kindergarten", "nursery", "childcare", "college", "university", "language_school", "music_school", "driving_school", "educational_institution"]),
  "fashion-accessories": new Set(["clothes", "clothing", "shoes", "jewelry", "jewellery", "bag", "bags", "watches", "fabric", "haberdashery", "leather", "leather_goods", "tailor", "dressmaker", "shoemaker", "jeweller", "underwear", "accessories", "fashion"]),
  "home-garden": new Set(["garden_centre", "garden_center", "florist", "furniture", "interior_decoration", "houseware", "hardware", "doityourself", "fireplace", "bathroom_furnishing", "kitchen", "paint", "doors", "trade", "electrical", "electrician", "carpenter", "upholsterer", "bed", "mattress", "carpet", "curtain", "lighting", "lamps", "building_materials", "tiles", "flooring", "plumbing", "plumber", "security", "window", "outdoor", "pool", "wholesale", "mall"]),
  "toys-leisure": new Set(["toys", "games", "board_games", "video_games", "sports", "sport", "tennis", "soccer", "football", "futsal", "rugby", "basketball", "volleyball", "handball", "baseball", "cricket", "badminton", "table_tennis", "archery", "athletics", "running", "cycling", "climbing", "martial_arts", "boxing", "wrestling", "gymnastics", "hockey", "skateboarding", "swimming", "fitness", "sports_centre", "sports_hall", "pitch", "stadium", "fitness_centre", "swimming_pool", "track", "golf_course", "miniature_golf", "disc_golf", "water_park", "ice_rink", "horse_riding", "recreation_ground", "playground", "hobby", "books", "book", "music", "musical_instrument", "instrument", "variety_store", "pet", "pet_shop", "gift", "souvenir", "party", "model", "craft", "art", "comic_books", "collectibles"]),
  "auto-mobility": new Set(["car", "car_repair", "car_wash", "car_rental", "motorcycle", "motorcycle_repair", "bicycle", "bicycle_repair", "bicycle_rental", "tyres", "car_parts", "rental", "fuel", "charging_station"]),
  "home-tech-mobility": new Set(["electronics", "computer", "computer_repair", "mobile_phone", "appliance", "laundry", "photo", "photographer", "camera", "hifi", "video", "software", "internet_cafe", "repair"]),
  "daily-services": new Set(["bank", "insurance", "post_office", "post_box", "police", "fire_station", "dry_cleaning", "locksmith", "key_cutter", "estate_agent", "stationery", "paper", "office_supplies", "newsagent", "funeral_directors", "travel_agency", "travel_agent", "copyshop", "print", "employment_agency", "lawyer", "notary", "accountant", "government", "association", "charity", "ngo", "research", "coworking", "ticket", "parcel_locker"]),
  "culture-leisure": new Set(["cinema", "theatre", "library", "public_bookcase", "arts_centre", "community_centre", "social_centre", "events_venue", "conference_centre", "museum", "gallery", "antiques"]),
  "green-spaces": new Set(["park", "garden", "nature_reserve", "dog_park", "picnic_site", "picnic_table", "square"]),
  attractions: new Set(["attraction", "viewpoint", "artwork", "amusement_park", "theme_park", "zoo", "aquarium", "shelter"]),
};

export const NEARBY_PLACE_TYPE_KEYS: Readonly<Record<string, TranslationKey>> = {
  supermarket: "nearbyStations.placeTypes.supermarket",
  convenience: "nearbyStations.placeTypes.convenience",
  alcohol: "nearbyStations.placeTypes.alcohol",
  tobacco: "nearbyStations.placeTypes.tobacco",
  bakery: "nearbyStations.placeTypes.bakery",
  butcher: "nearbyStations.placeTypes.butcher",
  greengrocer: "nearbyStations.placeTypes.greengrocer",
  florist: "nearbyStations.placeTypes.florist",
  deli: "nearbyStations.placeTypes.deli",
  health_food: "nearbyStations.placeTypes.healthFood",
  clothes: "nearbyStations.placeTypes.clothes",
  shoes: "nearbyStations.placeTypes.shoes",
  jewelry: "nearbyStations.placeTypes.jewelry",
  garden_centre: "nearbyStations.placeTypes.gardenCentre",
  garden_center: "nearbyStations.placeTypes.gardenCentre",
  department_store: "nearbyStations.placeTypes.shop",
  department: "nearbyStations.placeTypes.shop",
  shop: "nearbyStations.placeTypes.shop",
  book_store: "nearbyStations.placeTypes.books",
  bookstore: "nearbyStations.placeTypes.books",
  bookshop: "nearbyStations.placeTypes.books",
  clothing_store: "nearbyStations.placeTypes.clothes",
  shoe_store: "nearbyStations.placeTypes.shoes",
  toys: "nearbyStations.placeTypes.toys",
  games: "nearbyStations.placeTypes.games",
  sports: "nearbyStations.placeTypes.sports",
  sport: "nearbyStations.placeTypes.sports",
  tennis: "nearbyStations.placeTypes.sports",
  soccer: "nearbyStations.placeTypes.sports",
  football: "nearbyStations.placeTypes.sports",
  futsal: "nearbyStations.placeTypes.sports",
  rugby: "nearbyStations.placeTypes.sports",
  basketball: "nearbyStations.placeTypes.sports",
  volleyball: "nearbyStations.placeTypes.sports",
  handball: "nearbyStations.placeTypes.sports",
  baseball: "nearbyStations.placeTypes.sports",
  cricket: "nearbyStations.placeTypes.sports",
  badminton: "nearbyStations.placeTypes.sports",
  table_tennis: "nearbyStations.placeTypes.sports",
  archery: "nearbyStations.placeTypes.sports",
  athletics: "nearbyStations.placeTypes.sports",
  running: "nearbyStations.placeTypes.sports",
  cycling: "nearbyStations.placeTypes.sports",
  climbing: "nearbyStations.placeTypes.sports",
  martial_arts: "nearbyStations.placeTypes.sports",
  boxing: "nearbyStations.placeTypes.sports",
  wrestling: "nearbyStations.placeTypes.sports",
  gymnastics: "nearbyStations.placeTypes.sports",
  hockey: "nearbyStations.placeTypes.sports",
  skateboarding: "nearbyStations.placeTypes.sports",
  swimming: "nearbyStations.placeTypes.sports",
  fitness: "nearbyStations.placeTypes.sports",
  sports_centre: "nearbyStations.placeTypes.sports",
  sports_hall: "nearbyStations.placeTypes.sports",
  pitch: "nearbyStations.placeTypes.sports",
  stadium: "nearbyStations.placeTypes.sports",
  fitness_centre: "nearbyStations.placeTypes.sports",
  swimming_pool: "nearbyStations.placeTypes.sports",
  track: "nearbyStations.placeTypes.sports",
  golf_course: "nearbyStations.placeTypes.sports",
  miniature_golf: "nearbyStations.placeTypes.sports",
  disc_golf: "nearbyStations.placeTypes.sports",
  water_park: "nearbyStations.placeTypes.sports",
  ice_rink: "nearbyStations.placeTypes.sports",
  horse_riding: "nearbyStations.placeTypes.sports",
  recreation_ground: "nearbyStations.placeTypes.sports",
  playground: "nearbyStations.placeTypes.sports",
  school: "nearbyStations.placeTypes.school",
  kindergarten: "nearbyStations.placeTypes.kindergarten",
  nursery: "nearbyStations.placeTypes.nursery",
  childcare: "nearbyStations.placeTypes.childcare",
  college: "nearbyStations.placeTypes.college",
  university: "nearbyStations.placeTypes.university",
  language_school: "nearbyStations.placeTypes.languageSchool",
  music_school: "nearbyStations.placeTypes.musicSchool",
  driving_school: "nearbyStations.placeTypes.drivingSchool",
  educational_institution: "nearbyStations.placeTypes.school",
  hobby: "nearbyStations.placeTypes.hobby",
  variety_store: "nearbyStations.placeTypes.varietyStore",
  books: "nearbyStations.placeTypes.books",
  book: "nearbyStations.placeTypes.books",
  music: "nearbyStations.placeTypes.music",
  tattoo: "nearbyStations.placeTypes.tattoo",
  nail: "nearbyStations.placeTypes.nail",
  perfumery: "nearbyStations.placeTypes.perfumery",
  vape: "nearbyStations.placeTypes.vape",
  vape_shop: "nearbyStations.placeTypes.vape",
  e_cigarette: "nearbyStations.placeTypes.vape",
  chemist: "nearbyStations.placeTypes.pharmacy",
  coffee: "nearbyStations.placeTypes.coffee",
  tea: "nearbyStations.placeTypes.tea",
  cheese: "nearbyStations.placeTypes.cheese",
  chocolate: "nearbyStations.placeTypes.chocolate",
  confectionery: "nearbyStations.placeTypes.confectionery",
  pastry: "nearbyStations.placeTypes.pastry",
  beverages: "nearbyStations.placeTypes.beverages",
  wine: "nearbyStations.placeTypes.wine",
  wine_shop: "nearbyStations.placeTypes.wineShop",
  bottle: "nearbyStations.placeTypes.bottle",
  liquor: "nearbyStations.placeTypes.liquor",
  drinks: "nearbyStations.placeTypes.drinks",
  beer: "nearbyStations.placeTypes.beer",
  organic: "nearbyStations.placeTypes.organic",
  farm: "nearbyStations.placeTypes.farm",
  seafood: "nearbyStations.placeTypes.seafood",
  frozen_food: "nearbyStations.placeTypes.frozenFood",
  kiosk: "nearbyStations.placeTypes.kiosk",
  mall: "nearbyStations.placeTypes.mall",
  wholesale: "nearbyStations.placeTypes.wholesale",
  pet: "nearbyStations.placeTypes.pet",
  pet_shop: "nearbyStations.placeTypes.pet",
  gift: "nearbyStations.placeTypes.gift",
  souvenir: "nearbyStations.placeTypes.souvenir",
  bed: "nearbyStations.placeTypes.bed",
  mattress: "nearbyStations.placeTypes.mattress",
  fabric: "nearbyStations.placeTypes.fabric",
  haberdashery: "nearbyStations.placeTypes.haberdashery",
  leather: "nearbyStations.placeTypes.leather",
  leather_goods: "nearbyStations.placeTypes.leatherGoods",
  tailor: "nearbyStations.placeTypes.tailor",
  underwear: "nearbyStations.placeTypes.underwear",
  clothing: "nearbyStations.placeTypes.clothes",
  jewellery: "nearbyStations.placeTypes.jewelry",
  accessories: "nearbyStations.placeTypes.accessories",
  fashion: "nearbyStations.placeTypes.fashion",
  party: "nearbyStations.placeTypes.party",
  model: "nearbyStations.placeTypes.model",
  craft: "nearbyStations.placeTypes.craft",
  art: "nearbyStations.placeTypes.art",
  board_games: "nearbyStations.placeTypes.boardGames",
  video_games: "nearbyStations.placeTypes.videoGames",
  musical_instrument: "nearbyStations.placeTypes.musicalInstrument",
  instrument: "nearbyStations.placeTypes.musicalInstrument",
  comic_books: "nearbyStations.placeTypes.comicBooks",
  collectibles: "nearbyStations.placeTypes.collectibles",
  funeral_directors: "nearbyStations.placeTypes.funeralDirectors",
  travel_agency: "nearbyStations.placeTypes.travelAgency",
  photo: "nearbyStations.placeTypes.photo",
  copyshop: "nearbyStations.placeTypes.copyshop",
  mobile_phone: "nearbyStations.placeTypes.mobilePhone",
  appliance: "nearbyStations.placeTypes.appliance",
  laundry: "nearbyStations.placeTypes.laundry",
  camera: "nearbyStations.placeTypes.camera",
  hifi: "nearbyStations.placeTypes.hifi",
  video: "nearbyStations.placeTypes.video",
  print: "nearbyStations.placeTypes.print",
  employment_agency: "nearbyStations.placeTypes.employmentAgency",
  lawyer: "nearbyStations.placeTypes.lawyer",
  notary: "nearbyStations.placeTypes.notary",
  accountant: "nearbyStations.placeTypes.accountant",
  ticket: "nearbyStations.placeTypes.ticket",
  newsagent: "nearbyStations.placeTypes.newsagent",
  paper: "nearbyStations.placeTypes.paper",
  office_supplies: "nearbyStations.placeTypes.officeSupplies",
  parcel_locker: "nearbyStations.placeTypes.parcelLocker",
  carpet: "nearbyStations.placeTypes.carpet",
  curtain: "nearbyStations.placeTypes.curtain",
  lighting: "nearbyStations.placeTypes.lighting",
  lamps: "nearbyStations.placeTypes.lamps",
  building_materials: "nearbyStations.placeTypes.buildingMaterials",
  tiles: "nearbyStations.placeTypes.tiles",
  flooring: "nearbyStations.placeTypes.flooring",
  plumbing: "nearbyStations.placeTypes.plumbing",
  security: "nearbyStations.placeTypes.security",
  window: "nearbyStations.placeTypes.window",
  furniture: "nearbyStations.placeTypes.furniture",
  interior_decoration: "nearbyStations.placeTypes.interiorDecoration",
  houseware: "nearbyStations.placeTypes.houseware",
  hardware: "nearbyStations.placeTypes.hardware",
  doityourself: "nearbyStations.placeTypes.doItYourself",
  fireplace: "nearbyStations.placeTypes.fireplace",
  bathroom_furnishing: "nearbyStations.placeTypes.bathroomFurnishing",
  kitchen: "nearbyStations.placeTypes.kitchen",
  paint: "nearbyStations.placeTypes.paint",
  electronics: "nearbyStations.placeTypes.electronics",
  computer: "nearbyStations.placeTypes.computer",
  computer_repair: "nearbyStations.placeTypes.computerRepair",
  software: "nearbyStations.placeTypes.software",
  repair: "nearbyStations.placeTypes.repair",
  car: "nearbyStations.placeTypes.car",
  car_repair: "nearbyStations.placeTypes.carRepair",
  car_parts: "nearbyStations.placeTypes.carParts",
  motorcycle: "nearbyStations.placeTypes.motorcycle",
  motorcycle_repair: "nearbyStations.placeTypes.motorcycleRepair",
  tyres: "nearbyStations.placeTypes.tyres",
  dry_cleaning: "nearbyStations.placeTypes.dryCleaning",
  hearing_aids: "nearbyStations.placeTypes.hearingAids",
  optician: "nearbyStations.placeTypes.optician",
  estate_agent: "nearbyStations.placeTypes.estateAgent",
  locksmith: "nearbyStations.placeTypes.locksmith",
  hairdresser: "nearbyStations.placeTypes.hairdresser",
  beauty: "nearbyStations.placeTypes.beauty",
  health: "nearbyStations.placeTypes.health",
  doctors: "nearbyStations.placeTypes.health",
  dentist: "nearbyStations.placeTypes.health",
  clinic: "nearbyStations.placeTypes.health",
  hospital: "nearbyStations.placeTypes.health",
  physiotherapist: "nearbyStations.placeTypes.health",
  healthcare: "nearbyStations.placeTypes.health",
  pharmacy: "nearbyStations.placeTypes.pharmacy",
  restaurant: "nearbyStations.placeTypes.restaurant",
  cafe: "nearbyStations.placeTypes.cafe",
  bar: "nearbyStations.placeTypes.bar",
  fast_food: "nearbyStations.placeTypes.fastFood",
  pub: "nearbyStations.placeTypes.pub",
  food_court: "nearbyStations.placeTypes.foodCourt",
  ice_cream: "nearbyStations.placeTypes.iceCream",
  marketplace: "nearbyStations.placeTypes.marketplace",
  bank: "nearbyStations.placeTypes.bank",
  post_office: "nearbyStations.placeTypes.service",
  fuel: "nearbyStations.placeTypes.service",
  car_wash: "nearbyStations.placeTypes.service",
  charging_station: "nearbyStations.placeTypes.service",
  arts_centre: "nearbyStations.placeTypes.culture",
  community_centre: "nearbyStations.placeTypes.culture",
  social_centre: "nearbyStations.placeTypes.culture",
  public_bookcase: "nearbyStations.placeTypes.publicBookcase",
  events_venue: "nearbyStations.placeTypes.eventsVenue",
  conference_centre: "nearbyStations.placeTypes.conferenceCentre",
  park: "nearbyStations.placeTypes.park",
  garden: "nearbyStations.placeTypes.garden",
  nature_reserve: "nearbyStations.placeTypes.natureReserve",
  aquarium: "nearbyStations.placeTypes.aquarium",
  square: "nearbyStations.placeTypes.square",
  picnic_site: "nearbyStations.placeTypes.picnicSite",
  picnic_table: "nearbyStations.placeTypes.picnicTable",
  dog_park: "nearbyStations.placeTypes.dogPark",
  cinema: "nearbyStations.placeTypes.cinema",
  theatre: "nearbyStations.placeTypes.theatre",
  library: "nearbyStations.placeTypes.library",
  museum: "nearbyStations.placeTypes.museum",
  gallery: "nearbyStations.placeTypes.gallery",
  antiques: "nearbyStations.placeTypes.antiques",
  viewpoint: "nearbyStations.placeTypes.viewpoint",
  artwork: "nearbyStations.placeTypes.artwork",
  // Keep frequent OSM amenity and office values specific before the broad
  // category fallback is used for places without a more precise mapping.
  parking_space: "nearbyStations.placeTypes.parkingSpace",
  parking: "nearbyStations.placeTypes.parking",
  parking_entrance: "nearbyStations.placeTypes.parkingEntrance",
  motorcycle_parking: "nearbyStations.placeTypes.motorcycleParking",
  bicycle_parking: "nearbyStations.placeTypes.bicycleParking",
  bicycle: "nearbyStations.placeTypes.bicycle",
  bicycle_rental: "nearbyStations.placeTypes.bicycleRental",
  bicycle_repair_station: "nearbyStations.placeTypes.bicycleRepairStation",
  bench: "nearbyStations.placeTypes.bench",
  waste_basket: "nearbyStations.placeTypes.wasteBasket",
  recycling: "nearbyStations.placeTypes.recycling",
  waste_disposal: "nearbyStations.placeTypes.wasteDisposal",
  vending_machine: "nearbyStations.placeTypes.vendingMachine",
  post_box: "nearbyStations.placeTypes.postBox",
  letter_box: "nearbyStations.placeTypes.letterBox",
  ticket_validator: "nearbyStations.placeTypes.ticketValidator",
  drinking_water: "nearbyStations.placeTypes.drinkingWater",
  toilets: "nearbyStations.placeTypes.toilets",
  fountain: "nearbyStations.placeTypes.fountain",
  clock: "nearbyStations.placeTypes.clock",
  information: "nearbyStations.placeTypes.information",
  atm: "nearbyStations.placeTypes.atm",
  company: "nearbyStations.placeTypes.company",
  social_facility: "nearbyStations.placeTypes.socialFacility",
  place_of_worship: "nearbyStations.placeTypes.placeOfWorship",
  hotel: "nearbyStations.placeTypes.hotel",
  guest_house: "nearbyStations.placeTypes.guestHouse",
  townhall: "nearbyStations.placeTypes.townHall",
  government: "nearbyStations.placeTypes.government",
  association: "nearbyStations.placeTypes.association",
  charity: "nearbyStations.placeTypes.charity",
  ngo: "nearbyStations.placeTypes.ngo",
  research: "nearbyStations.placeTypes.research",
  laboratory: "nearbyStations.placeTypes.laboratory",
  police: "nearbyStations.placeTypes.police",
  fire_station: "nearbyStations.placeTypes.fireStation",
  veterinary: "nearbyStations.placeTypes.veterinary",
  medical_supply: "nearbyStations.placeTypes.medicalSupply",
  alternative: "nearbyStations.placeTypes.alternative",
  cosmetics: "nearbyStations.placeTypes.cosmetics",
  massage: "nearbyStations.placeTypes.massage",
  insurance: "nearbyStations.placeTypes.insurance",
  architect: "nearbyStations.placeTypes.architect",
  builder: "nearbyStations.placeTypes.builder",
  trade: "nearbyStations.placeTypes.trade",
  plumber: "nearbyStations.placeTypes.plumber",
  shoemaker: "nearbyStations.placeTypes.shoemaker",
  dressmaker: "nearbyStations.placeTypes.dressmaker",
  cleaning: "nearbyStations.placeTypes.cleaning",
  caterer: "nearbyStations.placeTypes.caterer",
  car_rental: "nearbyStations.placeTypes.carRental",
  taxi: "nearbyStations.placeTypes.taxi",
  bus_station: "nearbyStations.placeTypes.busStation",
  photo_booth: "nearbyStations.placeTypes.photoBooth",
  vehicle_inspection: "nearbyStations.placeTypes.vehicleInspection",
  electronics_repair: "nearbyStations.placeTypes.electronicsRepair",
  coworking: "nearbyStations.placeTypes.coworking",
  coworking_space: "nearbyStations.placeTypes.coworkingSpace",
  fashion_accessories: "nearbyStations.placeTypes.fashionAccessories",
  kick_scooter_rental: "nearbyStations.placeTypes.kickScooterRental",
  lavoir: "nearbyStations.placeTypes.lavoir",
  outdoor_seating: "nearbyStations.placeTypes.outdoorSeating",
  lounger: "nearbyStations.placeTypes.lounger",
  compressed_air: "nearbyStations.placeTypes.compressedAir",
  loading_dock: "nearbyStations.placeTypes.loadingDock",
  grit_bin: "nearbyStations.placeTypes.gritBin",
  trolley_bay: "nearbyStations.placeTypes.trolleyBay",
  slipway: "nearbyStations.placeTypes.slipway",
  financial: "nearbyStations.placeTypes.financial",
  diplomatic: "nearbyStations.placeTypes.diplomatic",
  studio: "nearbyStations.placeTypes.studio",
  centre: "nearbyStations.placeTypes.centre",
  convenience_gas: "nearbyStations.placeTypes.convenience",
  multi: "nearbyStations.placeTypes.sports",
  boules: "nearbyStations.placeTypes.sports",
  equestrian: "nearbyStations.placeTypes.sports",
  skateboard: "nearbyStations.placeTypes.sports",
  dojo: "nearbyStations.placeTypes.sports",
  dance: "nearbyStations.placeTypes.sports",
  rugby_union: "nearbyStations.placeTypes.sports",
  schoolyard: "nearbyStations.placeTypes.sports",
  fitness_station: "nearbyStations.placeTypes.sports",
  chess: "nearbyStations.placeTypes.sports",
  orienteering: "nearbyStations.placeTypes.sports",
  soccer_basketball: "nearbyStations.placeTypes.sports",
  shelter: "nearbyStations.placeTypes.shelter",
};

const NEARBY_PLACE_CATEGORY_TYPE_KEYS: Readonly<Record<NearbyPlace["category"], TranslationKey>> = {
  shop: "nearbyStations.placeTypes.shop",
  food: "nearbyStations.placeTypes.food",
  culture: "nearbyStations.placeTypes.culture",
  service: "nearbyStations.placeTypes.service",
  attraction: "nearbyStations.placeTypes.attraction",
};

export function walkingMinutesToMeters(minutes: number): number {
  return Math.max(0, minutes) * 80;
}

export interface NearbyWalkingMetricsSource {
  distanceMeters?: number;
  durationSeconds?: number;
}

export function nearbyPlaceWalkingDistanceMeters(
  place: Pick<NearbyPlace, "distanceMeters">,
  route?: NearbyWalkingMetricsSource,
): number {
  const routedDistanceMeters = route?.distanceMeters;
  return typeof routedDistanceMeters === "number"
    && Number.isFinite(routedDistanceMeters)
    && routedDistanceMeters >= 0
    ? Math.round(routedDistanceMeters)
    : Math.round(place.distanceMeters);
}

export function nearbyPlaceWalkingMinutes(
  place: Pick<NearbyPlace, "distanceMeters">,
  route?: NearbyWalkingMetricsSource,
): number {
  return nearbyWalkingMinutesFromSeconds(
    route?.durationSeconds,
    nearbyPlaceWalkingDistanceMeters(place, route),
  );
}

export function nearbyPlaceIsWithinWalkingMinutes(
  place: Pick<NearbyPlace, "distanceMeters">,
  route: NearbyWalkingMetricsSource | undefined,
  maxMinutes: NearbyWalkingMinutes,
): boolean {
  return nearbyPlaceWalkingMinutes(place, route) <= maxMinutes;
}

export function nearbyWalkingMinutesFromSeconds(durationSeconds: number | undefined, fallbackMeters: number): number {
  return Number.isFinite(durationSeconds) && (durationSeconds ?? 0) > 0
    ? Math.max(1, Math.ceil((durationSeconds ?? 0) / 60))
    : Math.max(1, Math.ceil(fallbackMeters / 80));
}

export function nearbyPlaceGoogleMapsUrl(
  place: Pick<NearbyPlace, "name" | "address" | "city" | "lat" | "lon">,
  context: { city?: string } = {},
): string {
  const city = context.city?.trim() || place.city?.trim();
  const normalizedAddress = normalizeNearbyPlaceText(place.address ?? "");
  const normalizedCity = normalizeNearbyPlaceText(city ?? "");
  const address = [
    place.address?.trim(),
    city && (!normalizedCity || !normalizedAddress.includes(normalizedCity)) ? city : undefined,
  ].filter(Boolean).join(", ");
  const destination = [place.name, address].filter(Boolean).join(", ") || `${place.lat},${place.lon}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
}

export function normalizeNearbyPlaceText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function placeKind(place: NearbyPlacePresentationSource): string {
  return place.kind?.trim() || "";
}

function placeCategory(place: NearbyPlacePresentationSource): NearbyPlace["category"] | undefined {
  return place.category;
}

export function nearbyPlaceTypeKey(place: NearbyPlacePresentationSource): TranslationKey {
  const kind = normalizeNearbyPlaceText(placeKind(place)).replace(/\s+/g, "_");
  const category = placeCategory(place);
  return NEARBY_PLACE_TYPE_KEYS[kind]
    ?? (category ? NEARBY_PLACE_CATEGORY_TYPE_KEYS[category] : undefined)
    ?? "nearbyStations.placeTypes.attraction";
}

export function nearbyPlaceDisplayName(
  place: NearbyPlacePresentationSource,
  translate?: (key: TranslationKey) => string,
): string {
  const name = [
    place.name,
    place.label,
    place.tags?.name,
    place.brand,
    place.tags?.brand,
    place.operator,
    place.tags?.operator,
  ].find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
  if (name) return name;

  if (translate && place.genericNameKey) return translate(place.genericNameKey);
  if (translate) return translate(nearbyPlaceTypeKey(place));
  return place.kind?.trim() || "";
}

export function nearbyPlaceHasKnownType(place: NearbyPlacePresentationSource): boolean {
  const kind = normalizeNearbyPlaceText(placeKind(place)).replace(/\s+/g, "_");
  return Boolean(NEARBY_PLACE_TYPE_KEYS[kind] || placeCategory(place));
}

/**
 * Canonical commerce predicate shared by the city map, neighborhood map,
 * directory summary and exports. The category fallback is intentional: old
 * compiled assets and legacy API responses may have `category: "food"`
 * without a persisted `rankingCategory`.
 */
export function isNearbyPlaceCommerce(place: NearbyPlacePresentationSource): boolean {
  return place.rankingCategory === "commerce"
    || place.category === "shop"
    || place.category === "food"
    || (place.tags ? classifyPlacesRankingCategory({ ...place.tags }) === "commerce" : false);
}

/** Parks, gardens and other named natural spaces used by the city comparison. */
export function isNearbyPlaceGreenSpace(place: NearbyPlacePresentationSource): boolean {
  const kind = normalizedPlaceKind(place);
  if (kind === "picnic_table") return false;
  const name = normalizeNearbyPlaceText(nearbyPlaceDisplayName(place));
  return isNaturalPlace(kind, place.category, name);
}

const BENCH_KINDS = new Set(["bench", "seat", "seating"]);
const WASTE_BASKET_KINDS = new Set(["waste_basket", "wastebasket", "litter_bin", "trash_bin"]);

function normalizedPlaceKind(place: NearbyPlacePresentationSource): string {
  return normalizeNearbyPlaceText(placeKind(place)).replace(/\s+/g, "_");
}

/** Benches remain in the compiled dataset but are opt-in on the map. */
export function isNearbyPlaceBench(place: NearbyPlacePresentationSource): boolean {
  return BENCH_KINDS.has(normalizedPlaceKind(place));
}

export function isNearbyPlaceParking(place: NearbyPlacePresentationSource): boolean {
  return PARKING_KINDS.has(normalizedPlaceKind(place));
}

/** Waste baskets are not useful POIs for the directory or map. */
export function isNearbyPlaceWasteBasket(place: NearbyPlacePresentationSource): boolean {
  return WASTE_BASKET_KINDS.has(normalizedPlaceKind(place));
}

export function isNearbyPlaceVisibleInDirectory(place: NearbyPlacePresentationSource): boolean {
  return !isNearbyPlaceBench(place) && !isNearbyPlaceWasteBasket(place);
}

export function isNearbyPlaceVisibleOnMap(
  place: NearbyPlacePresentationSource,
  showBenches = false,
  showParkings = false,
): boolean {
  return !isNearbyPlaceWasteBasket(place)
    && (showBenches || !isNearbyPlaceBench(place))
    && (showParkings || !isNearbyPlaceParking(place));
}

/**
 * The global line view is an outing planner: its places answer "what could I
 * do this weekend around this line?". Keep this exclusion list explicit even
 * though the activity allow-list below already removes most service records.
 * It documents the OSM infrastructure that must never compete with shops,
 * leisure/entertainment and culture: fountains, benches, waste facilities,
 * recycling points, parking and transit fixtures.
 */
export const GLOBAL_LINE_WEEKEND_EXCLUDED_KINDS: ReadonlySet<string> = new Set([
  // Transit infrastructure and station equipment.
  "bus_station",
  "bus_stop",
  "tram_stop",
  "train_station",
  "station",
  "stop_position",
  "platform",
  "public_transport",
  "railway",
  "shelter",
  "information",
  "vending_machine",
  "ticket",
  "ticket_machine",
  "ticket_validator",
  "toilets",
  "clock",
  "trolley_bay",
  "loading_dock",
  // Street furniture and utilities: no weekend activity value.
  "bench",
  "seat",
  "seating",
  "fountain",
  "drinking_water",
  "water_point",
  "waste_basket",
  "wastebasket",
  "litter_bin",
  "trash_bin",
  "recycling",
  "waste_disposal",
  "recycling_centre",
  "recycling_center",
  "recycling_container",
  "waste_transfer_station",
  "waste_transfer",
  "waste_management",
  "waste_collection",
  "waste_container",
  "dumpster",
  "sanitary_dump_station",
  "landfill",
  "composting",
  "dump",
  "grit_bin",
  // Parking and vehicle infrastructure are deliberately outside this mode.
  "parking",
  "parking_space",
  "parking_entrance",
  "motorcycle_parking",
  "bicycle_parking",
  "charging_station",
  "fuel",
]);

/** The only broad compiled groups useful for a weekend outing. */
export const GLOBAL_LINE_WEEKEND_ALLOWED_RANKING_CATEGORIES: ReadonlySet<PlacesRankingCategory> = new Set([
  "commerce",
  "sports-leisure",
  "culture",
]);

export function isNearbyPlaceVisibleForGlobalLine(place: NearbyPlacePresentationSource): boolean {
  const kind = normalizedPlaceKind(place);
  if (!isNearbyPlaceVisibleOnMap(place) || GLOBAL_LINE_WEEKEND_EXCLUDED_KINDS.has(kind)) return false;

  // `rankingCategory` is persisted by the compiled provider. The tag
  // fallback keeps older assets useful without admitting generic services.
  const ranking = place.rankingCategory
    ?? (place.tags ? classifyPlacesRankingCategory({ ...place.tags }) : undefined);
  if (ranking && GLOBAL_LINE_WEEKEND_ALLOWED_RANKING_CATEGORIES.has(ranking)) return true;

  // Legacy records can lack rankingCategory/tags. Their broad category still
  // safely identifies shops, food venues and culture; attractions are kept
  // only when they are recognizable leisure destinations (parks, viewpoints,
  // playgrounds, museums and similar places to visit).
  if (place.category === "shop" || place.category === "food" || place.category === "culture") return true;
  return place.category === "attraction" && isNearbyPlaceActivity(place, "leisure");
}

export function nearbyPlaceMarkerIconId(place: NearbyPlacePresentationSource): NearbyPlaceMarkerIconId {
  const kind = normalizedPlaceKind(place);
  const category = placeCategory(place);
  const name = normalizeNearbyPlaceText(nearbyPlaceDisplayName(place));

  if (isNearbyPlaceBench(place)) return "armchair";
  if (isSchoolPlace(kind, name)) return "school";
  if (isSportsPlace(kind, name)) return "dumbbell";
  if (isNaturalPlace(kind, category, name)) return "tree-pine";
  if (BOOK_KINDS.has(kind) || /^(bibliotheque|mediatheque|librairie|livres?)\b/u.test(name)) return "book-open";

  if (PARKING_KINDS.has(kind)) return "circle-parking";
  if (kind === "bank" || kind === "financial") return "banknote";
  if (kind === "atm" || kind === "cash_machine") return "wallet-cards";
  if (kind === "veterinary") return "dog";
  if (kind === "cheese") return "milk";
  if (kind === "florist") return "flower-2";
  if (kind === "post_box" || kind === "letter_box") return "mailbox";
  if (HEALTH_KINDS.has(kind)) return "cross";

  if (kind === "car_repair" || kind === "car") return "car";
  if (kind === "laundry") return "washing-machine";
  if (kind === "cinema") return "film";
  if (kind === "hearing_aids") return "ear";
  if (kind === "beauty") return "sparkles";
  if (kind === "theatre") return "drama";
  if (kind === "optician") return "glasses";
  if (kind === "funeral_directors") return "skull";
  if (kind === "convenience" && category === "shop") return "shopping-bag";
  if (kind === "greengrocer" && category === "shop") return "apple";
  if (kind === "hairdresser") return "scissors";
  if (kind === "computer") return "laptop";
  if (kind === "pharmacy") return "cross";
  if (kind === "supermarket") return "shopping-cart";
  if (kind === "clothes") return "shirt";
  if (kind === "bakery") return "croissant";
  if (kind === "butcher") return "ham";
  if (category === "shop") return "shopping-bag";
  if (category === "food") return "utensils";
  if (category === "culture") return "landmark";
  return "sparkles";
}

const SCHOOL_KINDS = new Set([
  "school",
  "kindergarten",
  "nursery",
  "childcare",
  "college",
  "university",
  "language_school",
  "music_school",
  "driving_school",
  "educational_institution",
]);

const BOOK_KINDS = new Set([
  "library",
  "public_bookcase",
  "books",
  "book",
  "book_store",
  "bookstore",
  "bookshop",
]);

const PARKING_KINDS = new Set([
  "parking",
  "parking_space",
  "parking_entrance",
  "motorcycle_parking",
  "bicycle_parking",
]);

const HEALTH_KINDS = new Set([
  "pharmacy",
  "chemist",
  "medical_supply",
  "doctors",
  "dentist",
  "clinic",
  "hospital",
  "physiotherapist",
  "healthcare",
  "health",
]);

const NATURAL_KINDS = new Set([
  "park",
  "garden",
  "nature_reserve",
  "dog_park",
  "picnic_site",
  "picnic_table",
  "square",
]);

const SPORTS_KINDS = new Set([
  "sports",
  "sport",
  "tennis",
  "soccer",
  "football",
  "futsal",
  "rugby",
  "basketball",
  "volleyball",
  "handball",
  "baseball",
  "cricket",
  "badminton",
  "table_tennis",
  "archery",
  "athletics",
  "running",
  "cycling",
  "climbing",
  "martial_arts",
  "boxing",
  "wrestling",
  "gymnastics",
  "hockey",
  "skateboarding",
  "swimming",
  "fitness",
  "sports_centre",
  "sports_hall",
  "pitch",
  "stadium",
  "fitness_centre",
  "swimming_pool",
  "track",
  "golf_course",
  "miniature_golf",
  "disc_golf",
  "water_park",
  "ice_rink",
  "horse_riding",
  "recreation_ground",
  "playground",
]);

function isSchoolPlace(kind: string, name: string): boolean {
  return SCHOOL_KINDS.has(kind)
    || /^(lycee|ecole|maternelle|college|universite|campus|school|kindergarten|nursery)\b/u.test(name);
}

function isNaturalPlace(kind: string, category: NearbyPlace["category"] | undefined, name: string): boolean {
  return NATURAL_KINDS.has(kind)
    || (category === "attraction" && /^(parc|jardin|square|bois|foret|promenade|arboretum|espace vert|aire de jeux)\b/u.test(name));
}

function isSportsPlace(kind: string, name: string): boolean {
  return SPORTS_KINDS.has(kind)
    || /^(gymnase|stade|terrain|complexe sportif|club sportif|tennis|city stade)\b/u.test(name);
}

export function countNearbyPlaces(places: readonly NearbyPlacePresentationSource[]): {
  total: number;
  commerce: number;
} {
  return {
    total: places.length,
    commerce: places.filter(isNearbyPlaceCommerce).length,
  };
}

export function resolveNearbyPlaceGroupId(place: NearbyPlace): NearbyPlaceGroupId {
  const kind = normalizeNearbyPlaceText(place.kind).replace(/\s+/g, "_");
  if (isNearbyPlaceGreenSpace(place)) return "green-spaces";
  for (const group of NEARBY_PLACE_GROUPS) {
    if (group.id !== "other" && KINDS_BY_GROUP[group.id].has(kind)) return group.id;
  }
  if (place.category === "food") return "restaurants-cafes";
  if (place.category === "service") return "daily-services";
  if (place.category === "culture") return "culture-leisure";
  if (place.category === "attraction") return "attractions";
  return "other";
}

export function filterAndGroupNearbyPlaces(options: {
  places: readonly NearbyPlace[];
  radiusMeters: number;
  query: string;
  typeLabel: (place: NearbyPlace) => string;
  groupLabel: (group: NearbyPlaceGroupPresentation) => string;
  locale?: string;
  walkingDistance?: (place: NearbyPlace) => number | undefined;
  includePlaceIds?: ReadonlySet<string>;
}): NearbyPlaceGroupResult[] {
  const normalizedQuery = normalizeNearbyPlaceText(options.query);
  const groupById = new Map(NEARBY_PLACE_GROUPS.map((group) => [group.id, { ...group, places: [] as NearbyPlace[] }]));
  const candidates: Array<{
    place: NearbyPlace;
    group: NearbyPlaceGroupPresentation & { places: NearbyPlace[] };
  }> = [];

  for (const place of options.places) {
    const distanceMeters = options.walkingDistance?.(place) ?? place.distanceMeters;
    if (distanceMeters > options.radiusMeters && !options.includePlaceIds?.has(place.id)) continue;
    const group = groupById.get(resolveNearbyPlaceGroupId(place)) ?? groupById.get("other")!;
    candidates.push({ place, group });
  }

  const visibleCandidates = normalizedQuery
    ? fuzzyFilter(candidates, options.query, ({ place, group }) => [
        nearbyPlaceDisplayName(place),
        place.address ?? "",
        place.kind,
        options.typeLabel(place),
        options.groupLabel(group),
      ])
    : candidates;
  for (const candidate of visibleCandidates) candidate.group.places.push(candidate.place);

  for (const group of groupById.values()) {
    group.places.sort((left, right) => (options.walkingDistance?.(left) ?? left.distanceMeters)
      - (options.walkingDistance?.(right) ?? right.distanceMeters)
      || left.name.localeCompare(right.name, options.locale));
  }

  return NEARBY_PLACE_GROUPS
    .map((group) => groupById.get(group.id)!)
    .filter((group) => group.places.length > 0);
}


export type NearbyCityActivity = "commerce" | "economic" | "leisure";
export type NearbyOptionalPlace = "companies" | "worship" | "artworks";

export function nearbyOptionalPlace(place: NearbyPlacePresentationSource): NearbyOptionalPlace | undefined {
  const kind = normalizedPlaceKind(place);
  if (kind === "place_of_worship" || place.tags?.amenity === "place_of_worship") return "worship";
  if (kind === "artwork" || place.tags?.tourism === "artwork") return "artworks";
  if (["company", "office", "industrial", "works"].includes(kind) || place.tags?.office || place.tags?.industrial || place.tags?.man_made === "works") return "companies";
  return undefined;
}

export function isNearbyPlaceActivity(place: NearbyPlacePresentationSource, activity: NearbyCityActivity): boolean {
  if (activity === "commerce") return isNearbyPlaceCommerce(place);
  const kind = normalizedPlaceKind(place);
  const ranking = place.rankingCategory ?? (place.tags ? classifyPlacesRankingCategory({ ...place.tags }) : undefined);
  if (activity === "economic") return isNearbyPlaceCommerce(place)
    || nearbyOptionalPlace(place) === "companies" || Boolean(place.tags?.craft || place.tags?.healthcare)
    || ranking === "health" || ["hotel", "hostel", "motel", "guest_house", "bank", "insurance", "estate_agent", "coworking_space"].includes(kind);
  return ranking === "sports-leisure" || ranking === "culture" || place.category === "culture"
    || (place.category === "attraction" && nearbyOptionalPlace(place) !== "worship")
    || ["bar", "pub", "nightclub", "cafe", "restaurant", "park", "garden", "playground"].includes(kind);
}
