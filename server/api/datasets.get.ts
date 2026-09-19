import { defineEventHandler } from "h3";
import { getDatasetManagerResponse } from "../services/datasets/datasetManager";

export default defineEventHandler((event) => getDatasetManagerResponse(event));
