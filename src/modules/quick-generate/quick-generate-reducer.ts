import { t } from "@/shared/constants";

export interface QuickGenerateState {
  promptText: string;
  duration: number;
  selectedStyle: string;
  selectedResolution: string;
  selectedCharacters: string[];
  selectedScene: string | null;
  showAdvanced: boolean;
  enableSmartOptimization: boolean;
  negativePrompt: string;
  seed: string;
  cfgScale: number;
  referenceImage: string | null;
  referenceVideo: string | null;
  referenceVideoFile: File | null;
  referenceVideoName: string | null;
  generatedPrompt: string | null;
  templateDialogOpen: boolean;
  cachedVideoUrl: string | null;
  cachedVideoUrlTaskId: string | null;
  isSavingToAssets: boolean;
}

export type QuickGenerateAction =
  | { type: "SET_PROMPT_TEXT"; value: string }
  | { type: "SET_DURATION"; value: number }
  | { type: "SET_SELECTED_STYLE"; value: string }
  | { type: "SET_SELECTED_RESOLUTION"; value: string }
  | { type: "TOGGLE_CHARACTER"; charId: string }
  | { type: "TOGGLE_SCENE"; sceneId: string }
  | { type: "SET_SHOW_ADVANCED"; value: boolean }
  | { type: "SET_ENABLE_SMART_OPTIMIZATION"; value: boolean }
  | { type: "SET_NEGATIVE_PROMPT"; value: string }
  | { type: "SET_SEED"; value: string }
  | { type: "SET_CFG_SCALE"; value: number }
  | { type: "SET_REFERENCE_IMAGE"; value: string | null }
  | { type: "UPLOAD_REFERENCE_VIDEO"; blobUrl: string; file: File; name: string }
  | { type: "REMOVE_REFERENCE_VIDEO" }
  | { type: "SET_GENERATED_PROMPT"; value: string | null }
  | { type: "SET_TEMPLATE_DIALOG_OPEN"; value: boolean }
  | { type: "SET_CACHED_VIDEO_URL"; url: string | null; taskId: string | null }
  | { type: "SET_IS_SAVING_TO_ASSETS"; value: boolean }
  | { type: "APPLY_TEMPLATE"; prompt: string; duration: number; style: string };

export const initialState: QuickGenerateState = {
  promptText: "",
  duration: 5,
  selectedStyle: t("quickGenerate.defaultStyle"),
  selectedResolution: "1920x1080",
  selectedCharacters: [],
  selectedScene: null,
  showAdvanced: false,
  enableSmartOptimization: true,
  negativePrompt: "",
  seed: "",
  cfgScale: 7,
  referenceImage: null,
  referenceVideo: null,
  referenceVideoFile: null,
  referenceVideoName: null,
  generatedPrompt: null,
  templateDialogOpen: false,
  cachedVideoUrl: null,
  cachedVideoUrlTaskId: null,
  isSavingToAssets: false,
};

export function quickGenerateReducer(state: QuickGenerateState, action: QuickGenerateAction): QuickGenerateState {
  switch (action.type) {
    case "SET_PROMPT_TEXT":
      return { ...state, promptText: action.value };
    case "SET_DURATION":
      return { ...state, duration: action.value };
    case "SET_SELECTED_STYLE":
      return { ...state, selectedStyle: action.value };
    case "SET_SELECTED_RESOLUTION":
      return { ...state, selectedResolution: action.value };
    case "TOGGLE_CHARACTER":
      return {
        ...state,
        selectedCharacters: state.selectedCharacters.includes(action.charId)
          ? state.selectedCharacters.filter((id) => id !== action.charId)
          : [...state.selectedCharacters, action.charId],
      };
    case "TOGGLE_SCENE":
      return {
        ...state,
        selectedScene: state.selectedScene === action.sceneId ? null : action.sceneId,
      };
    case "SET_SHOW_ADVANCED":
      return { ...state, showAdvanced: action.value };
    case "SET_ENABLE_SMART_OPTIMIZATION":
      return { ...state, enableSmartOptimization: action.value };
    case "SET_NEGATIVE_PROMPT":
      return { ...state, negativePrompt: action.value };
    case "SET_SEED":
      return { ...state, seed: action.value };
    case "SET_CFG_SCALE":
      return { ...state, cfgScale: action.value };
    case "SET_REFERENCE_IMAGE":
      return { ...state, referenceImage: action.value };
    case "UPLOAD_REFERENCE_VIDEO":
      return {
        ...state,
        referenceVideo: action.blobUrl,
        referenceVideoFile: action.file,
        referenceVideoName: action.name,
      };
    case "REMOVE_REFERENCE_VIDEO":
      return {
        ...state,
        referenceVideo: null,
        referenceVideoFile: null,
        referenceVideoName: null,
      };
    case "SET_GENERATED_PROMPT":
      return { ...state, generatedPrompt: action.value };
    case "SET_TEMPLATE_DIALOG_OPEN":
      return { ...state, templateDialogOpen: action.value };
    case "SET_CACHED_VIDEO_URL":
      return {
        ...state,
        cachedVideoUrl: action.url,
        cachedVideoUrlTaskId: action.taskId,
      };
    case "SET_IS_SAVING_TO_ASSETS":
      return { ...state, isSavingToAssets: action.value };
    case "APPLY_TEMPLATE":
      return {
        ...state,
        promptText: action.prompt,
        duration: action.duration,
        selectedStyle: action.style,
        templateDialogOpen: false,
      };
    default:
      return state;
  }
}
