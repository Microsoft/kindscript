import * as actions from '../actions/types'
import { lookupActivityProgress } from '../lib/skillMapUtils';

export interface SkillsMapState {
    user: UserState;
    maps: { [key: string]: SkillsMap };
    selectedItem?: string;

    editorView?: EditorViewState;
}


export interface EditorViewState {
    currentHeaderId?: string;
    currentMapId: string;
    currentActivityId: string;
}

const initialState: SkillsMapState = {
    user: {
        mapProgress: {},
        completedTags: {}
    },
    maps: {}
}

const topReducer = (state: SkillsMapState = initialState, action: any): SkillsMapState => {
    switch (action.type) {
        case actions.ADD_SKILLS_MAP:
            return {
                ...state,
                user: {
                    ...state.user,
                    mapProgress: {
                        ...state.user.mapProgress,
                        [action.id]: { mapId: action.map.id, activityState: {} }
                    }
                },
                maps: {
                    ...state.maps,
                    [action.map.mapId]: action.map
                }
            }
        case actions.CLEAR_SKILLS_MAPS:
            return {
                ...state,
                maps: {}
            };
        case actions.CHANGE_SELECTED_ITEM:
            return {
                ...state,
                selectedItem: action.id
            };
        case actions.OPEN_ACTIVITY:
            return {
                ...state,
                editorView: {
                    currentMapId: action.mapId,
                    currentActivityId: action.activityId,
                    currentHeaderId: lookupActivityProgress(state.user, action.mapId, action.activityId)?.headerId
                }
            };
        case actions.CLOSE_ACTIVITY:
            return {
                ...state,
                editorView: undefined
            };
        case actions.SET_HEADERID_FOR_ACTIVITY:
            return {
                ...state,
                editorView: {
                    ...state.editorView!,
                    currentHeaderId: action.id
                },
                user: setHeaderIdForActivity(state.user, state.editorView!.currentMapId, state.editorView!.currentActivityId, action.id)
            };
        default:
            return state
    }
}


export function setHeaderIdForActivity(user: UserState, mapId: string, activityId: string, headerId: string): UserState {
    let existing = lookupActivityProgress(user, mapId, activityId);

    if (!existing) {
        existing = {
            isCompleted: false,
            activityId,
            headerId
        }
    }

    return {
        ...user,
        mapProgress: {
            ...user.mapProgress,
            [mapId]: {
                ...(user.mapProgress[mapId] || { mapId }),
                activityState: {
                    ...(user.mapProgress[mapId]?.activityState || {}),
                    [activityId]: {
                        ...existing,
                        headerId: headerId
                    }
                }
            }
        }
    };
}

export default topReducer;