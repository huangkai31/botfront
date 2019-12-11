import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { traverseStory, aggregateEvents } from '../../lib/story.utils';

import { Stories } from './stories.collection';
import { deleteResponse } from '../graphql/botResponses/mongo/botResponses';

export const checkStoryNotEmpty = story => story.story && !!story.story.replace(/\s/g, '').length;

Meteor.methods({
    'stories.insert'(story) {
        check(story, Object);
        return Stories.insert(story);
    },

    'stories.update'(story) {
        check(story, Object);
        const {
            _id, path, ...rest
        } = story;

        if (!path) {
            return Stories.update({ _id }, { $set: { ...rest } });
        }
        const storyData = Stories.findOne({ _id });
        const { events: oldEvents } = storyData;
        const newEvents = aggregateEvents(storyData, story.story, path[path.length - 1]); // path[(last index)] is the id of the updated branch

        // check if a response was removed
        const removedEvents = (oldEvents || []).filter(event => event.match(/^utter_/) && !newEvents.includes(event));
        // delete the removed response from the project if it is the last instance of that response
        const sharedResponses = Stories.find({ events: { $in: removedEvents }, _id: { $ne: _id } }, { fields: { events: true } }).fetch();
        if (removedEvents.length > 0) {
            const deleteResponses = removedEvents.filter((event) => {
                if (!sharedResponses) return true;
                return !sharedResponses.find(({ events }) => events.includes(event));
            });
            deleteResponses.forEach(event => deleteResponse('bf', event));
        }

        const { indices } = traverseStory(Stories.findOne({ _id: story._id }), path);
        const update = indices.length
            ? Object.assign(
                {},
                ...Object.keys(rest).map(key => (
                    { [`branches.${indices.join('.branches.')}.${key}`]: rest[key] }
                )),
            )
            : rest;
        return Stories.update({ _id }, { $set: { ...update, events: newEvents } });
    },

    'stories.delete'(story) {
        check(story, Object);
        return Stories.remove(story);
    },

    'stories.getStories'(projectId) {
        check(projectId, String);
        return Stories.find({ projectId }).fetch();
    },

    'stories.addCheckpoints'(destinationStory, branchPath) {
        check(destinationStory, String);
        check(branchPath, Array);
        return Stories.update(
            { _id: destinationStory },
            { $addToSet: { checkpoints: branchPath } },
        );
    },
    'stories.removeCheckpoints'(destinationStory, branchPath) {
        check(destinationStory, String);
        check(branchPath, Array);
        return Stories.update(
            { _id: destinationStory },
            { $pullAll: { checkpoints: [branchPath] } },
        );
    },
});
