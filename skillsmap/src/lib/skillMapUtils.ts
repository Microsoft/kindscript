
export function isActivityCompleted(user: UserState, mapId: string, activityId: string) {
    const progress = user.mapProgress[mapId];

    return !!(progress?.activityState[activityId]?.isCompleted);
}

export function isMapUnlocked(user: UserState, map: SkillsMap) {
    for (const pre of map.prerequisites) {
        if (pre.type === "tag") {
            const numCompleted = user.completedTags[pre.tag];
            if (numCompleted === undefined || numCompleted < pre.numberCompleted) return false;
        }
        else if (pre.type === "activity") {
            if (user.mapProgress[pre.mapId]) return false;
        }
    }

    return true;
}

export function isActivityUnlocked(user: UserState, map: SkillsMap, activityId: string) {
    if (map.root.activityId === activityId) return true;

    return checkRecursive(map.root);

    function checkRecursive(root: MapActivity) {
        if (isActivityCompleted(user, map.mapId, root.activityId)) {
            if (root.next.some(activity => activity.activityId === activityId)) {
                return true;
            }

            for (const next of root.next) {
                if (checkRecursive(next)) return true;
            }
        }

        return false;
    }
}