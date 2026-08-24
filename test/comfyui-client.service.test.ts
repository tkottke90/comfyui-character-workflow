import { expect } from 'chai';
import {
  getObjectInfoChoices,
  isImageUploadInput,
  ObjectInfo,
} from '../src/services/comfyui-client.service';

const OBJECT_INFO: ObjectInfo = {
  LoadImage: {
    input: {
      required: {
        image: [['photo-a.png', 'photo-b.png'], { image_upload: true }],
      },
    },
  },
  KSampler: {
    input: {
      required: {
        seed: ['INT', { default: 0, min: 0, max: 999999 }],
      },
    },
  },
  LoraLoaderModelOnly: {
    input: {
      required: {
        lora_name: [['style-a.safetensors', 'style-b.safetensors'], {}],
      },
    },
  },
};

describe('isImageUploadInput', () => {
  it('is true for an input flagged image_upload in /object_info', () => {
    expect(isImageUploadInput(OBJECT_INFO, 'LoadImage', 'image')).to.equal(true);
  });

  it('is false for a plain scalar input', () => {
    expect(isImageUploadInput(OBJECT_INFO, 'KSampler', 'seed')).to.equal(false);
  });

  it('is false for a choice-list input without the image_upload flag', () => {
    expect(isImageUploadInput(OBJECT_INFO, 'LoraLoaderModelOnly', 'lora_name')).to.equal(false);
  });

  it('is false for an unknown node or input', () => {
    expect(isImageUploadInput(OBJECT_INFO, 'Nonexistent', 'image')).to.equal(false);
    expect(isImageUploadInput(OBJECT_INFO, 'LoadImage', 'nonexistent')).to.equal(false);
  });
});

describe('getObjectInfoChoices', () => {
  it('returns the choice list for a choice-list input', () => {
    expect(getObjectInfoChoices(OBJECT_INFO, 'LoraLoaderModelOnly', 'lora_name')).to.have.members([
      'style-a.safetensors',
      'style-b.safetensors',
    ]);
  });

  it('returns an empty array for a scalar (non-choice-list) input', () => {
    expect(getObjectInfoChoices(OBJECT_INFO, 'KSampler', 'seed')).to.deep.equal([]);
  });

  it('returns an empty array for an unknown node', () => {
    expect(getObjectInfoChoices(OBJECT_INFO, 'Nonexistent', 'image')).to.deep.equal([]);
  });
});
